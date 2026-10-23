/**
 * ROUND 5 — lane `gates-perf` gates (docs/ROUND5-PLAN.md §9 "gates-perf"), W0a block.
 *
 *   node tools/gates.mjs --port 5255 --lane gates-perf
 *
 * (tools/gates.config.mjs discovers this file by pattern; no --extra needed in
 * a tree that carries this lane's gates.config.mjs.)
 *
 * W0a block (plan §3.1 exit + the lane's §2 W0a deliverables):
 *   A-gate-preludes          0 species literals / old-map coordinates in EVERY tools/gates*.mjs (+ budgets.mjs),
 *                            an offending file named with its owning lane; staging via the preludes
 *   A-gates-no-hero-literals no Round-4 rig bone or rig name in tools/gate*.mjs (W0 scope)
 *   A-gates-autodiscover     gates.config.mjs loads tools/gates.r5.*.mjs by pattern; lane rows shadow carried rows by id
 *   A-carried-suite          (runner, R33) gates.r5.carried.mjs holds every CARRY/RESTAGE Appendix-B gate and is a
 *                            regression guard against tools/gates/carried-baseline.json over every SEALED observation
 *                            of this build (>= 1 complete full carried run, once per round, + targeted partial
 *                            re-runs; the run ledger lies outside every tree); the kept visual rows are signed R29
 *                            verdicts on the newest full run's frames, every other visual row is SKIP-replaced
 *   A-chrome-semaphore       machine-wide Chrome slots, released on exit and on SIGKILL; the disk/memory
 *                            preflight refuses to launch Chrome
 *   A-port-guard             (LAST) both harnesses refuse no-port / 5173 / out-of-range before opening a socket or a
 *                            child; the RUN MONITORS (worker thread, lsof every 2 s, positive control on a scratch
 *                            listener) show 0 connections to :5173 from this lane run's process tree and from every
 *                            sealed carried run it vouches for, gap-free; no tree's Vite cacheDir is Kevin's
 * A79-runner-verdict-line / A80-chrome-profile-hygiene are CARRY rows and run in the carried suite; A9 (R26)
 * and A21 (§9 re-cast GPU bar, R33 f: names its DPR) are carried rows edited in place.
 *
 * W0b block (tools/gates/gates-perf.w0b.mjs, spread into GATES below, before A-port-guard):
 *   A-reference-clean, A-reference-set, A-alloc-rate, A-vram-ledger, A90-abs, A-unattributed-cap
 *
 * CLIs (not gates):
 *   node tools/gates.r5.gates-perf.mjs --watch-5173 <out.json> [--seconds N]
 *       an EXTERNAL lsof sampler (every 2 s). A-port-guard grades it only when named by CAL_PORT_WATCH, and then
 *       it must have started before every window it vouches for and still be live (updated <= 10 s ago).
 *   node tools/gates.r5.gates-perf.mjs --judge-keygen --out <file.pem outside every tree>
 *   node tools/gates.r5.gates-perf.mjs --judge-register --judge-name <who> --port <5271|5280-5299>
 *       --judge-pub <base64> --orchestrator-key <orchestrator.pem>
 *   node tools/gates.r5.gates-perf.mjs --judge --list [--port <run port>] [--seal <sealId>]
 *   node tools/gates.r5.gates-perf.mjs --judge --seal <sealId> --id <V id> --pass true|false
 *       --rationale <text> --judge-name <who> --port <5271|5280-5299> --judge-key <judge.pem> [--reference <file>]
 *       an R29 verdict, signed with a judge key the orchestrator registered; A-carried-suite counts it only when
 *       the registering key is one the grader trusts (CAL_ORCHESTRATOR_PUBKEY / CAL_ORCHESTRATOR_PUBKEY_FILE).
 *
 * SIDE EFFECT: imported by `node tools/gates.mjs` of this tree on an allowed port (gates.config.mjs auto-discovers
 * this file), it (1) starts the RUN MONITOR worker, (2) wraps Page.prototype.screenshot to bind every carried
 * visual frame at capture (hash + copy to the ledger's staging dir) and observes the report write, and (3) installs
 * the SEAL hook: at exit, a run that executed >= 80 % of the carried rows copies its captured report, its
 * capture-bound frames and its monitor log into the ledger and appends a v3 seal (see "THE RUN LEDGER" below).
 * A refused port installs nothing and spawns nothing (A-port-guard's trap checks that).
 */
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdtempSync, rmSync, statSync, lstatSync, renameSync, realpathSync,
  appendFileSync, mkdirSync, writeSync, utimesSync } from 'fs';
import fsMod from 'fs';
import { syncBuiltinESMExports } from 'module';
import { createHash, generateKeyPairSync, createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'crypto';
import { spawn, spawnSync } from 'child_process';
import { Worker } from 'worker_threads';
import os from 'os';
import path from 'path';
import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';
import { W0_PLACES } from './gate-places.mjs';
import { ROSTER, ROLE_PENDING, ALL_MACHINES_REASONS } from './gate-roster.mjs';
import { GATES as W0B_GATES } from './gates/gates-perf.w0b.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOLS, '..');
const LANE = 'gates-perf';
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const read = (p) => readFileSync(p, 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------------ */
/* shared facts                                                               */
/* ------------------------------------------------------------------------ */

/**
 * The forbidden vocabularies come from the SPEC, not from literals here (this
 * file is itself in the scanned glob): the Round-4 machine kinds are the "old
 * kind" column of docs/ROUND5-BIBLE.md §10.2, and the old rig's literals are
 * the regex plan §9 writes verbatim for A-gates-no-hero-literals.
 */
function specVocabulary() {
  const bible = read(path.join(ROOT, 'docs', 'ROUND5-BIBLE.md'));
  const at = bible.indexOf('### 10.2 Machines');
  const words = new Set();
  for (const line of bible.slice(at, bible.indexOf('\n### ', at + 10)).split('\n')) {
    const m = /^\| ([^|]+) \| \*\*[A-Za-z]+\*\* \| `[a-z]+` \|$/.exec(line.trim());
    if (!m) continue;
    for (const w of m[1].split(',')) {
      const k = w.trim().toLowerCase();
      if (/^[a-z][a-z-]+$/.test(k)) { words.add(k); if (k.includes('-')) words.add(k.replace(/-/g, '')); }
    }
  }
  const plan = read(path.join(ROOT, 'docs', 'ROUND5-PLAN.md'));
  const line = plan.split('\n').find((l) => l.includes('**A-gates-no-hero-literals**'));
  const rx = line && /`\/(.+?)\/i`/.exec(line);
  return { species: [...words].sort(), heroRe: rx ? new RegExp(rx[1], 'i') : null };
}
const VOCAB = specVocabulary();
const SPECIES_WORDS = VOCAB.species;
const SPECIES_ALT = SPECIES_WORDS.map((w) => w.replace(/-/g, '\\-')).join('|');
const SPECIES_WORD_RE = new RegExp(`\\b(${SPECIES_ALT})s?\\b`, 'i');
const SPECIES_LITERAL_RE = new RegExp(`(['"\`])(${SPECIES_ALT})\\1`, 'gi');
const SPECIES_STAGING_RE = new RegExp(`\\.kind\\s*===?\\s*['"\`](${SPECIES_ALT})['"\`]|\\.spawn\\??\\.?\\(\\s*['"\`](${SPECIES_ALT})['"\`]`, 'i');
/** plan §9 A-gates-no-hero-literals, read from the plan. */
const HERO_LITERAL_RE = VOCAB.heroRe;

/** `tools/gates.r5.<lane>.mjs` names its lane (same pattern as gates.config.mjs LANE_FILE_RE). */
const LANE_FILE_RE_LOCAL = /^gates\.r5\.([a-z0-9][a-z0-9-]*)\.mjs$/;

/** The files this lane owns among the gate sources (stricter scan: no species WORD at all). */
const OWNED = ['gates.mjs', 'gates.config.mjs', 'gates.r5.carried.mjs', 'gates.r5.gates-perf.mjs',
  'gate-roster.mjs', 'gate-places.mjs', 'budgets.mjs', 'gates/gates-perf.w0b.mjs'];

/** `tools/gates*.mjs` (A-gate-preludes) and `tools/gate*.mjs` (A-gates-no-hero-literals). */
const gatesGlob = () => readdirSync(TOOLS).filter((f) => /^gates.*\.mjs$/.test(f)).sort();
const gateGlob = () => readdirSync(TOOLS).filter((f) => /^gate.*\.mjs$/.test(f)).sort();

/** docs/ROUND5-INVENTORY.md Appendix B: [{ id, lane, kind, verdict }] */
function appendixB() {
  const md = read(path.join(ROOT, 'docs', 'ROUND5-INVENTORY.md'));
  const at = md.indexOf('## Appendix B');
  const rows = [];
  for (const line of md.slice(at).split('\n')) {
    const m = /^\| `([^`]+)` \| ([^|]+) \| ([avr]) \| \*\*(\w+)\*\* \|/.exec(line);
    if (m) rows.push({ id: m[1], lane: m[2].trim(), kind: m[3], verdict: m[4] });
  }
  return rows;
}

/**
 * The Round-4 FAILs the inventory recorded (its Oct-15 baseline table and Round 4's last full suite),
 * id -> where. Informational only: an inherited FAIL still fails A-carried-suite (the plan's bar has no
 * FAIL exemption); the detail says which offenders Round 5 inherited so the ruling is quick.
 */
function round4Fails() {
  const md = read(path.join(ROOT, 'docs', 'ROUND5-INVENTORY.md'));
  const out = {};
  for (const m of md.matchAll(/^\| `([^`]+)` \| \*\*FAIL\*\*([^|]*)\|/gm)) out[m[1]] = 'inventory baseline run: FAIL' + m[2].trimEnd();
  const suite = /last full suite \(`([^`]+)`, ([^)]+)\): \*\*[^*]*?\d+ FAIL\*\* \(([^)]+)\)/.exec(md);
  if (suite) for (const id of suite[3].match(/A[\w-]+/g) || []) out[id] = out[id] || `Round 4's last full suite (${suite[1]}, ${suite[2]}): FAIL`;
  return out;
}

/**
 * Carried ids renamed from their Appendix-B id because the old id named the old
 * rig (A-gates-no-hero-literals): carried id -> matcher for the Appendix-B id.
 */
const RENAMED = { 'A73b-hero-effort': /^A73b-[a-z]+-effort$/ };

/**
 * THE OLD-MAP COORDINATE VOCABULARY (fix round 2: the judge found A25b's nav legs, 4-number
 * arrays, passing a scan that only knew `[x, z]` / `f(x, z` / `x:..z:` / `.set(` / URL forms
 * and only the W0 table's pairs). A pair is an old-map coordinate when it is
 *   - a place of the W0 map table (tools/gate-places.mjs) or the rest point (sites.js), or
 *   - an ABSOLUTE placement in a Round-4 gate (tools/gates/archive/): `.set(x, y, z)`,
 *     `px=x&pz=z`, `{ x, z }` (a 2-D map point; a 3-D `{ x, y, z }` is a listener/probe-space
 *     point), `new V(x, y, z)`, `spawn('<kind>', x, z`, or either end of a leg in a list of
 *     `[x0, z0, x1, z1]` legs,
 * inside the W0 map's extent, not on an axis, at least 10 m out.
 */
const SITES = await import('../src/world/island/sites.js');
const EXTENT_R = (await import('../src/world/island/extent.js')).PLAY_RADIUS + 90;
const NUM = String.raw`-?\d+(?:\.\d+)?`;
function oldMapVocabulary() {
  const vocab = new Map();
  // an axis pair (a 0 in it) is just as often a RELATIVE offset (a listener 300 m ahead), so the
  // map table's axis places are kept but match explicit placements only (coordRegexes)
  const add = (x, z, src) => {
    if (!Number.isFinite(x) || !Number.isFinite(z) || (x === 0 && z === 0)) return;
    if (Math.max(Math.abs(x), Math.abs(z)) < 10 || Math.abs(x) > EXTENT_R || Math.abs(z) > EXTENT_R) return;
    if ((x === 0 || z === 0) && !/^W0 table|^sites\.js/.test(src)) return;
    const k = x + ',' + z;
    if (!vocab.has(k)) vocab.set(k, { x, z, src: new Set() });
    vocab.get(k).src.add(src);
  };
  add(SITES.REST.x, SITES.REST.z, 'sites.js REST');
  add(SITES.REST_SITE.x, SITES.REST_SITE.z, 'sites.js REST_SITE');
  for (const rec of Object.values(W0_PLACES)) {
    add(rec.x, rec.z, 'W0 table');
    for (const pt of rec.points || []) add(pt[0], pt[1], 'W0 table');
    for (const lg of rec.legs || []) { add(lg[0], lg[1], 'W0 table'); add(lg[2], lg[3], 'W0 table'); }
    if (rec.look) add(rec.look.x, rec.look.z, 'W0 table');
  }
  const strong = [
    new RegExp(String.raw`\.set\(\s*(${NUM})\s*,\s*[^,()]*,\s*(${NUM})\s*\)`, 'g'),
    new RegExp(String.raw`px=(${NUM})&pz=(${NUM})`, 'g'),
    new RegExp(String.raw`\{\s*x\s*:\s*(${NUM})\s*,\s*z\s*:\s*(${NUM})\s*[,}]`, 'g'),
    new RegExp(String.raw`new \w+\(\s*(${NUM})\s*,\s*[^,()]*,\s*(${NUM})\s*\)`, 'g'),
    new RegExp(String.raw`spawn\w*\(\s*['"\x60][^'"\x60]+['"\x60]\s*,\s*(${NUM})\s*,\s*(${NUM})`, 'g'),
    // W0b fix round 2 (the A103 slope the scan missed): a declared pair, `const SX = -264, SZ = -176`
    new RegExp(String.raw`\b[\w$]*[xX][\w$]*\s*=\s*(${NUM})\s*,\s*[\w$]*[zZ][\w$]*\s*=\s*(${NUM})\b`, 'g'),
  ];
  const QUAD = String.raw`\[\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*,\s*(${NUM})\s*\]`;
  const QUAD_NC = String.raw`\[\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*,\s*${NUM}\s*\]`;
  const legList = new RegExp(String.raw`\[\s*${QUAD_NC}(?:\s*,\s*${QUAD_NC})+`, 'g');
  const archive = path.join(TOOLS, 'gates', 'archive');
  let archived = 0;
  try {
    for (const f of readdirSync(archive).filter((x) => x.endsWith('.mjs'))) {
      archived++;
      const code = stripComments(read(path.join(archive, f)));
      for (const re of strong) for (const m of code.matchAll(re)) add(+m[1], +m[2], 'Round-4 placement');
      for (const L of code.matchAll(legList)) for (const m of L[0].matchAll(new RegExp(QUAD, 'g'))) { add(+m[1], +m[2], 'Round-4 leg'); add(+m[3], +m[4], 'Round-4 leg'); }
    }
  } catch { /* the archive is gone (W3): the W0 table and sites.js still define the map */ }
  return { pairs: [...vocab.values()], archived };
}
const num = (v) => String(v).replace('.', '\\.').replace('-', '-\\s*');
const N_ANY = String.raw`-?\s*\d+(?:\.\d+)?`;
function coordRegexes(x, z) {
  const X = num(x), Z = num(z);
  if (x === 0 || z === 0) return [
    new RegExp(`set\\(\\s*${X}\\s*,[^,()]*,\\s*${Z}\\s*\\)`),
    new RegExp(`px=${X}&pz=${Z}\\b`),
  ];
  return [
    new RegExp(`set\\(\\s*${X}\\s*,[^,()]*,\\s*${Z}\\s*\\)`),                 // position.set(x, y, z)
    new RegExp(`\\(\\s*${X}\\s*,[^,()]*,\\s*${Z}\\s*\\)`),                     // new V(x, y, z), f(x, y, z)
    new RegExp(`px=${X}&pz=${Z}\\b`),                                           // URL params
    new RegExp(`\\bx\\s*:\\s*${X}\\s*,\\s*(?:y\\s*:[^,]*,\\s*)?z\\s*:\\s*${Z}\\b`),      // { x, z }
    new RegExp(`[\\[(]\\s*${X}\\s*,\\s*${Z}\\s*[,\\])]`),                        // [x, z], f(x, z), the first half of [x, z, x1, z1]
    new RegExp(`\\[\\s*${N_ANY}\\s*,\\s*${N_ANY}\\s*,\\s*${X}\\s*,\\s*${Z}\\s*\\]`),    // the second half of [x0, z0, x, z]
  ];
}
/** literal absolute placements: `x: N, z: N` keys, `.position.set(N, y, N)`, `spawn*(<kind>, N, N`, `px=N&pz=N` */
const LITERAL_PLACEMENT = [
  new RegExp(String.raw`\bx\s*:\s*(${NUM})\s*,\s*z\s*:\s*(${NUM})\b`),
  // W0b fix round 2: a declared absolute pair (`const SX = -264, SZ = -176`, `const X0 = -60, Z0 = -45`, `BX = 0, BZ = 120`)
  new RegExp(String.raw`\b[\w$]*[xX][\w$]*\s*=\s*(${NUM})\s*,\s*[\w$]*[zZ][\w$]*\s*=\s*(${NUM})\b`),
  new RegExp(String.raw`position\.set\(\s*(${NUM})\s*,[^,()]*,\s*(${NUM})\s*\)`),
  new RegExp(String.raw`\.spawn\w*\(\s*[^,()]+,\s*(${NUM})\s*,\s*(${NUM})\s*[,)]`),
  new RegExp(String.raw`px=(${NUM})&pz=(${NUM})`),
];
/**
 * W0b fix round 2 (A106 measured distance to the openGround spot as `o.position.x + 60, o.position.z + 45`): a vocabulary
 * pair written as the OFFSETS of a distance, `hypot(o.position.x + 60, o.position.z + 45)` is the distance to the point
 * (-60, -45). Only pairs of the old-map vocabulary count, and only inside hypot() (an offset placement such as
 * `p.position.set(fire.x + 80, y, fire.z + 80)` is relative to a live object and names no place).
 */
const OFFSET_PAIR = new RegExp(String.raw`hypot\(\s*[^,()]*\.x\s*([+-])\s*(\d+(?:\.\d+)?)\s*,\s*[^,()]*\.z\s*([+-])\s*(\d+(?:\.\d+)?)\s*\)`);
const offsetPairOf = (l) => {
  const m = OFFSET_PAIR.exec(l);
  return m ? { x: (m[1] === '+' ? -1 : 1) * Number(m[2]), z: (m[3] === '+' ? -1 : 1) * Number(m[4]) } : null;
};
/** strip comments (keeping line breaks, so hits keep their line numbers) so a sentence ABOUT an old coordinate is not counted as one */
const stripComments = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ');

/**
 * Old-IP terms and reference stills in what a judge READS (fix round 2: re-staged criteria still
 * named HZD/HFW stills and the old wordmark). Graded on every carried row's title / criteria /
 * reference and every visual row's (any lane), plus reference-still basenames inside carried
 * code (an action row's detail text citing a still). Licence-clean references live under
 * reference/r5/ (A-reference-set, W0b).
 */
// the old hero's name is not written here (A-gates-no-hero-literals): it is the plain-word alternative
// of the plan's own A-gates-no-hero-literals regex
const OLD_HERO_NAMES = HERO_LITERAL_RE ? HERO_LITERAL_RE.source.split('|').filter((w) => /^[a-z]+$/.test(w)) : [];
const IP_TERM_RE = new RegExp(['\\bhzd\\b', '\\bhfw\\b', 'horizon zero', 'horizon forbidden', '\\bnora\\b', ...OLD_HERO_NAMES.map((w) => `\\b${w}\\b`)].join('|'), 'i');
function referenceStillRe() {
  let stills = [];
  try { stills = readdirSync(path.join(ROOT, 'reference')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)); } catch { stills = []; }
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { stills, re: new RegExp(`(?:${[...stills.map(esc), String.raw`spear-[a-z0-9-]+\.jpe?g`].join('|')})`, 'i') };
}
const textOf = (v) => (Array.isArray(v) ? v.join(' ') : typeof v === 'string' ? v : '');

/* ------------------------------------------------------------------------ */
/* A-gate-preludes                                                           */
/* ------------------------------------------------------------------------ */
function gatePreludes(GATES) {
  const files = gatesGlob();
  const extra = ['budgets.mjs', 'gates/gates-perf.w0b.mjs'];   // A21's staging lives in budgets.mjs; the W0b rows in tools/gates/
  const scan = [...files, ...extra.filter((f) => !files.includes(f))];
  const speciesLiterals = {}, ownedSpeciesWords = {}, coords = {};
  const vocab = oldMapVocabulary();
  const pairs = vocab.pairs;
  const pairKeys = new Set(pairs.map(({ x, z }) => x + ',' + z));
  for (const f of scan) {
    const text = read(path.join(TOOLS, f));
    const lits = [...text.matchAll(SPECIES_LITERAL_RE)].map((m) => m[0]);
    if (lits.length) speciesLiterals[f] = lits.slice(0, 8).concat(lits.length > 8 ? ['…+' + (lits.length - 8)] : []);
    if (OWNED.includes(f)) {
      const lines = text.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => SPECIES_WORD_RE.test(l));
      if (lines.length) ownedSpeciesWords[f] = lines.slice(0, 6).map(([n, l]) => n + ': ' + l.trim().slice(0, 90));
    }
    const lines = stripComments(text).split('\n');
    const hits = [];
    for (const { x, z, src } of pairs) {
      const res = coordRegexes(x, z);
      const at = lines.findIndex((l) => res.some((re) => re.test(l)));
      if (at >= 0) hits.push(`${f}:${at + 1} (${x}, ${z}) [${[...src].join(', ')}]: ${lines[at].trim().slice(0, 90)}`);
    }
    // any LITERAL absolute placement, whatever map it names (plan §9: no gate names a coordinate)
    lines.forEach((l, i) => {
      for (const re of LITERAL_PLACEMENT) {
        const m = re.exec(l);
        if (m && Math.max(Math.abs(+m[1]), Math.abs(+m[2])) >= 10) { hits.push(`${f}:${i + 1} (${m[1]}, ${m[2]}) [literal placement]: ${l.trim().slice(0, 90)}`); break; }
      }
      const o = offsetPairOf(l);
      if (o && pairKeys.has(o.x + ',' + o.z)) hits.push(`${f}:${i + 1} (${o.x}, ${o.z}) [old-map pair written as distance offsets]: ${l.trim().slice(0, 90)}`);
    });
    if (hits.length) coords[f] = [...new Set(hits)];
  }
  // POSITIVE + NEGATIVE CONTROL: the scanner must see every Round-4 form (the A25b legs the judge
  // found, a set(), a 2-D point, a URL, a spawn) and must not see distance bands or a 3-D probe point
  const lineHit = (l) => pairs.some(({ x, z }) => coordRegexes(x, z).some((re) => re.test(l)))
    || LITERAL_PLACEMENT.some((re) => { const m = re.exec(l); return !!m && Math.max(Math.abs(+m[1]), Math.abs(+m[2])) >= 10; })
    || (() => { const o = offsetPairOf(l); return !!o && pairKeys.has(o.x + ',' + o.z); })();
  // (built from the W0 table at run time, so this file names no coordinate itself)
  const W = (k) => W0_PLACES[k], [lg0, lg1] = W('navLegs').legs;
  const SHOULD = [`const legs = [[${lg0.join(', ')}], [${lg1.join(', ')}]];`, `p.position.set(${W('rimView').x}, 0, ${W('rimView').z});`,
    `const q = { x: ${W('herdSite').x}, z: ${W('herdSite').z} };`, `params: 'px=${W('waterFeature').x}&pz=${W('waterFeature').z}&yaw=4.7'`,
    `ctx.machines.spawn(k, ${W('rockShelf').x}, ${W('rockShelf').z});`, `const ends = [[${lg1[2] + 7}, ${lg1[3] + 3}, ${lg1[2]}, ${lg1[3]}]];`,
    // W0b fix round 2: the two forms the scan missed (A103's declared slope pair, A106's offset distance to openGround)
    `const SX = ${W('meleeSlope').x}, SZ = ${W('meleeSlope').z}, UP = ${W('meleeSlope').heading};`,
    `if (Math.hypot(o.position.x ${W('openGround').x < 0 ? '+' : '-'} ${Math.abs(W('openGround').x)}, o.position.z ${W('openGround').z < 0 ? '+' : '-'} ${Math.abs(W('openGround').z)}) < 70) {`];
  const SHOULD_NOT = ['const BANDS = [[6, 10], [10, 15], [15, 20]];', '{ x: 14.14, y: 1.6, z: -14.14 },', 'for (const band of [10, 20, 30]) {', 'const TOL = [20, 20, 0.12, 0.10];',
    // relative offsets name no place
    'm = spawn(kind, p.position.x + 14, p.position.z + 14);', 'const dx = 3, dz = 4;', 'p.position.set(fire.x + 80, p.position.y, fire.z + 80);'];
  // and the old-IP scan must see what the judge saw in the Round-4 text (the archived originals)
  let ipControl = null;
  try { ipControl = ['gates.round4.player-melee.mjs', 'gates.round4.progression-expansion.mjs', 'gates.round4.shell-menus.mjs']
    .map((f) => ({ f, seen: IP_TERM_RE.test(read(path.join(TOOLS, 'gates', 'archive', f))) })); } catch { ipControl = null; }
  const selfTest = { missed: SHOULD.filter((l) => !lineHit(l)), falseHits: SHOULD_NOT.filter((l) => lineHit(l)),
    ipMissed: ipControl ? ipControl.filter((c) => !c.seen).map((c) => c.f) : [] };
  // old-IP terms and reference stills in what a judge reads, and stills cited in carried code
  const stillRe = referenceStillRe();
  const ipText = [], ipCode = [];
  for (const g of GATES || []) {
    const isCarried = g.source === 'gates.r5.carried.mjs' || g.lane === 'carried';
    if (!isCarried && g.kind !== 'visual') continue;
    for (const k of ['title', 'criteria', 'reference']) {
      let t = '';
      try { t = textOf(g[k]); } catch { t = ''; }
      const terms = [...new Set([...t.matchAll(new RegExp(IP_TERM_RE.source, 'gi'))].map((m) => m[0]))];
      const jpg = [...t.matchAll(/[\w./-]+\.(?:jpe?g|png|webp)\b/gi)].map((m) => m[0])
        .filter((tok) => !tok.startsWith('reference/r5/') && (/\.jpe?g$/i.test(tok) || stillRe.re.test(tok)));
      if (terms.length || jpg.length) ipText.push({ id: g.id, file: g.source, field: k, hits: [...terms, ...jpg] });
    }
    if (isCarried) {
      let code = '';
      try { code = stripComments([g.setup, g.assert].filter((x) => typeof x === 'string').join('\n')); } catch { code = ''; }
      const m = [...code.matchAll(new RegExp(stillRe.re.source, 'gi'))].map((x) => x[0]);
      if (m.length) ipCode.push({ id: g.id, hits: [...new Set(m)] });
    }
  }
  // the DIES set is gone from the merged registry
  const app = appendixB();
  const dies = app.filter((r) => r.verdict === 'DIES').map((r) => r.id);
  const ids = new Set((GATES || []).map((g) => g.id));
  const diesPresent = dies.filter((id) => ids.has(id));
  // every carried row that stages by role / place / hero names carries the matching prelude
  const carried = (GATES || []).filter((g) => g.source === 'gates.r5.carried.mjs' || g.lane === 'carried');
  const body = (g) => [g.setup, g.assert].filter((s) => typeof s === 'string').join('\n');
  const needs = { roster: /\b(KIND\.|stageRole\(|liveOf\(|livesOf\(|stagedPicks\(|STAGED_KINDS|noKindsSkip\(|anyKind\(|spawnRole\(|isStaged\(|liveStaged\(|livesStaged\(|liveOfKind\(|stageAny\(|memVictim\()/,
    places: /\b(PLACE\(|standAt\(|placeSkip\()/, hero: /\b(HBN?\(|chainOf\(|chainLink\(|chainBones\()/ };
  const marker = { roster: '__R5_ROSTER__', places: '__R5_PLACES__', hero: '__R5_HERO__' };
  const unresolved = [], uses = { roster: 0, places: 0, hero: 0 };
  const literalStaging = [];
  for (const g of carried) {
    const b = body(g);
    for (const k of Object.keys(needs)) {
      if (!needs[k].test(b)) continue;
      uses[k]++;
      if (!b.includes(marker[k])) unresolved.push(`${g.id}: uses ${k} helpers without the ${k} prelude`);
    }
    // a species literal compared or spawned is staging by species, whatever the scan above found
    if (SPECIES_STAGING_RE.test(b)) literalStaging.push(g.id);
  }
  // W0b fix round 2 (judge finding: A92/A93/A94/A78/A79/A90-expansion took "the first live machine of any kind" and
  // A50b measured every live kind, legacy included, and this scan could not see it): EVERY use of ctx.machines.list in
  // a re-staged row, and in this lane's own staging sources, must be a roster helper (liveStaged, livesStaged,
  // liveOfKind, stageAny, memVictim, stagedPicks, liveOf, stageRole: the roster prelude, removed before the scan), a
  // KIND[...] / STAGED_KINDS filter on the same line, or a whole-roster operation annotated on its own line with one of
  // the closed reasons of gate-roster ALL_MACHINES_REASONS. Anything else is a pick that can stage a legacy kind (R28).
  const MLIST = /machines\s*(?:\?\.|\.)\s*list\b|machines\s*&&\s*[\w$.]*machines\s*\.\s*list\b/;
  const STAGED_FILTER = /STAGED_KINDS|KIND\[|isStaged\(/;
  const ANNOT = /\/\*\s*r5-all-machines:\s*([a-z-]+)\s*\*\//;
  const machineUse = { unstagedPicks: [], badReasons: [], filtered: 0, annotated: {}, annotatedSites: new Map() };
  const scanMachineUse = (text, where) => {
    const raw = String(text).split(ROSTER).join('\n');
    const rawLines = raw.split('\n'), lines = stripComments(raw).split('\n');
    lines.forEach((l, i) => {
      if (!MLIST.test(l)) return;
      const a = ANNOT.exec(rawLines[i]);
      if (a) {
        if (!ALL_MACHINES_REASONS[a[1]]) { machineUse.badReasons.push(`${where}: unknown reason "${a[1]}": ${l.trim().slice(0, 100)}`); return; }
        machineUse.annotated[a[1]] = (machineUse.annotated[a[1]] || 0) + 1;
        const k = a[1] + ' | ' + l.trim().slice(0, 110);
        if (!machineUse.annotatedSites.has(k)) machineUse.annotatedSites.set(k, new Set());
        machineUse.annotatedSites.get(k).add(where.split(':')[0]);
        return;
      }
      if (STAGED_FILTER.test(l)) { machineUse.filtered++; return; }
      machineUse.unstagedPicks.push(`${where}: ${l.trim().slice(0, 120)}`);
    });
  };
  for (const g of carried) scanMachineUse(body(g), g.id);
  for (const f of ['budgets.mjs', 'gates/gates-perf.w0b.mjs']) scanMachineUse(read(path.join(TOOLS, f)), f);
  // POSITIVE + NEGATIVE CONTROL for this scan: the W0a re-stage's own A92 pick and A50b list must be flagged; an
  // annotated freeze, a KIND filter and a roster helper call must not
  const pickControl = (() => {
    const before = machineUse.unstagedPicks.length, bad0 = machineUse.badReasons.length, ann0 = { ...machineUse.annotated }, f0 = machineUse.filtered;
    const sites0 = new Map(machineUse.annotatedSites);
    scanMachineUse('const fresh = () => C.machines.list.find(x => x.alive !== false && !x._disposed && x.root);\nconst list = (__CTX__.machines?.list || []).filter(m => m.alive);', 'control+');
    const seen = machineUse.unstagedPicks.length - before;
    scanMachineUse('for (const m of /* r5-all-machines: freeze */ __CTX__.machines.list) m.update = () => {};\nlet m = (__CTX__.machines?.list || []).find(x => x.alive && x.kind === KIND[r]);\nconst m = await stageAny();', 'control-');
    const falseHits = machineUse.unstagedPicks.length - before - seen;
    machineUse.unstagedPicks.length = before; machineUse.badReasons.length = bad0; machineUse.annotated = ann0; machineUse.filtered = f0; machineUse.annotatedSites = sites0;
    return { positives: 2, seen, negatives: 2, falseHits };
  })();
  // GRADED (R33 (e), Oct 18): gates-perf's own files and gates.r5.carried.mjs. Every other lane's gate file is
  // scanned the same way and REPORTED with its owning lane (offendersByLane), and is graded at that lane's own
  // exit, because rule 1 means only that lane (or the orchestrator at merge) can clear it.
  const laneOf = (f) => (OWNED.includes(f) ? LANE : LANE_FILE_RE_LOCAL.exec(f)?.[1] || 'orchestrator');
  const offendersByLane = {};
  for (const f of new Set([...Object.keys(speciesLiterals), ...Object.keys(coords)])) {
    (offendersByLane[laneOf(f)] = offendersByLane[laneOf(f)] || []).push({ file: f,
      speciesLiterals: speciesLiterals[f] || [], oldMapCoordinates: coords[f] || [] });
  }
  for (const h of ipText) (offendersByLane[laneOf(h.file || '')] = offendersByLane[laneOf(h.file || '')] || []).push({ file: h.file, gate: h.id, field: h.field, oldIpTermsOrStills: h.hits });
  for (const h of ipCode) (offendersByLane[LANE] = offendersByLane[LANE] || []).push({ file: 'gates.r5.carried.mjs', gate: h.id, field: 'setup/assert', referenceStills: h.hits });
  const ownedClean = Object.keys(ownedSpeciesWords).length === 0;
  const graded = (f) => OWNED.includes(f || '');
  const gradedSpecies = Object.keys(speciesLiterals).filter(graded), gradedCoords = Object.keys(coords).filter(graded);
  const gradedIpText = ipText.filter((h) => graded(h.file));
  const otherLanesReported = Object.fromEntries(Object.entries(offendersByLane).filter(([l]) => l !== LANE));
  const checks = {
    noSpeciesLiteralInOwnedFiles: gradedSpecies.length === 0,
    noOldMapCoordinateInOwnedFiles: gradedCoords.length === 0,
    gatesPerfFilesNameNoSpecies: ownedClean,
    diesSetGone: diesPresent.length === 0,
    everyPreludeResolved: unresolved.length === 0,
    noLiteralStagingInCarried: literalStaging.length === 0,
    noMachinePickWithoutRoster: machineUse.unstagedPicks.length === 0 && machineUse.badReasons.length === 0,
    machinePickScanSelfTest: pickControl.seen === pickControl.positives && pickControl.falseHits === 0,
    noOldIpTermOrStillInJudgedText: gradedIpText.length === 0,
    noReferenceStillInCarriedCode: ipCode.length === 0,
    carriedLoaded: carried.length > 0,
    vocabularyRead: SPECIES_WORDS.length >= 18,
    coordinateVocabularyRead: pairs.length >= 25,
    scannerSelfTest: selfTest.missed.length === 0 && selfTest.falseHits.length === 0 && selfTest.ipMissed.length === 0,
  };
  const pass = Object.values(checks).every(Boolean);
  return { pass, detail: {
    verdict: (pass ? 'PASS' : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', ')
      + (offendersByLane[LANE] ? ' — in gates-perf files: ' + [...new Set(offendersByLane[LANE].map((x) => x.file))].join(', ') : ''))
      + (Object.keys(otherLanesReported).length ? ' — reported, graded at their own exit (R33 e): '
        + Object.entries(otherLanesReported).map(([l, fs]) => l + ' (' + [...new Set(fs.map((x) => x.file))].join(', ') + ')').join('; ') : ''),
    checks, offendersByLane, gradedFiles: scan.filter(graded), reportedFiles: scan.filter((f) => !graded(f)),
    scanned: scan, speciesVocabulary: SPECIES_WORDS.length + ' kind names from bible §10.2',
    speciesLiterals, oldMapCoordinates: coords, gatesPerfFilesSpeciesWords: ownedSpeciesWords,
    oldMapPairsChecked: pairs.length, coordinateSources: { roundFourGateFilesRead: vocab.archived,
      bySource: pairs.reduce((a, p) => { for (const k of p.src) a[k] = (a[k] || 0) + 1; return a; }, {}) },
    scannerSelfTest: { ...selfTest, positives: SHOULD.length, negatives: SHOULD_NOT.length },
    oldIpTermsOrStillsInJudgedText: ipText, referenceStillsInCarriedCode: ipCode,
    referenceStillsKnown: stillRe.stills.length,
    diesInRegistry: diesPresent, diesExpected: dies.length,
    carriedRows: carried.length, preludeUses: uses, unresolvedPreludes: unresolved.slice(0, 12), literalStaging,
    machineListUse: { unstagedPicks: machineUse.unstagedPicks.slice(0, 40), unstagedPickCount: machineUse.unstagedPicks.length,
      unknownReasons: machineUse.badReasons, stagedFilterLines: machineUse.filtered, annotatedByReason: machineUse.annotated,
      reasons: ALL_MACHINES_REASONS, selfTest: pickControl,
      annotatedSites: [...machineUse.annotatedSites].map(([k, rows]) => ({ site: k, rows: rows.size, sample: [...rows].slice(0, 4) })) },
    rule: 'R33 (e): graded over gates-perf\'s own files and gates.r5.carried.mjs; (W0b fix round 2) every machines.list use in a carried row or in budgets.mjs / gates-perf.w0b.mjs is a roster helper (staged kinds only, R28), a KIND[...] / STAGED_KINDS filter on its line, or annotated /* r5-all-machines: <reason> */ with a reason of gate-roster ALL_MACHINES_REASONS; every other tools/gates*.mjs is scanned and reported, graded at its lane\'s exit. A species literal is a quoted string that IS a Round-4 kind id; an old-map coordinate is a W0 table / REST / Round-4 absolute placement or leg pair in code (comments stripped), as a call, array, leg, object or URL; the files gates-perf owns may not even name a kind in prose; no carried or visual row names HZD/HFW/Horizon Zero/Nora/the old hero name or a non-r5 reference still in its title, criteria or reference, and no carried row cites a reference still in its code',
  } };
}

/* ------------------------------------------------------------------------ */
/* A-gates-no-hero-literals                                                  */
/* ------------------------------------------------------------------------ */
function noHeroLiterals(GATES) {
  const files = gateGlob();
  const hits = {};
  for (const f of files) {
    const lines = read(path.join(TOOLS, f)).split('\n');
    const h = [];
    lines.forEach((l, i) => { if (HERO_LITERAL_RE.test(l)) h.push((i + 1) + ': ' + l.trim().slice(0, 100)); });
    if (h.length) hits[f] = h.slice(0, 6).concat(h.length > 6 ? ['…+' + (h.length - 6)] : []);
  }
  // informational: the W3 scope is "all of tools/" (tools/lint is the lexicon, gates/archive is history)
  const w3 = {};
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) { if (!/^(node_modules|assets)$/.test(e.name)) walk(p); continue; }
      if (!/\.(mjs|js|json|md)$/.test(e.name)) continue;
      let t = ''; try { t = read(p); } catch { continue; }
      const n = t.split('\n').filter((l) => HERO_LITERAL_RE.test(l)).length;
      if (n) w3[rel(p)] = n;
    }
  };
  walk(TOOLS);
  // gates that read bones do it through the published animator surface
  const carried = (GATES || []).filter((g) => g.lane === 'carried');
  const viaAnimator = carried.filter((g) => /__R5_HERO__|animator\?*\.b\?*\.|\.chainOf\(/.test(String(g.assert || '') + String(g.setup || ''))).length;
  return { pass: Object.keys(hits).length === 0 && files.length > 0, detail: {
    scope: 'W0: tools/gate*.mjs', filesScanned: files, hits,
    carriedRowsReadingBonesViaAnimator: viaAnimator,
    w3ScopeAllOfTools: { files: Object.keys(w3).length, linesByFile: w3,
      note: 'reported, not graded at W0: the W3 exit bar is all of tools/ (audio recipes regenerate in W3; tools/gates/archive is history to exclude or delete)' },
  } };
}

/* ------------------------------------------------------------------------ */
/* A-gates-autodiscover                                                      */
/* ------------------------------------------------------------------------ */
function childJSON(script, timeoutMs = 60000) {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('JSON '));
  return { status: r.status, json: line ? JSON.parse(line.slice(5)) : null, stderr: (r.stderr || '').slice(-600) };
}
function autodiscover() {
  const cfgPath = path.join(TOOLS, 'gates.config.mjs');
  const src = stripComments(read(cfgPath));
  const byPattern = /readdirSync\([^)]*\)[\s\S]{0,200}gates\\\.r5\\\./.test(src) || /LANE_FILE_RE\s*=\s*\/\^gates\\\.r5\\\./.test(src);
  const namesALane = [...src.matchAll(/['"]gates\.r5\.([a-z0-9-]+)\.mjs['"]/g)].map((m) => m[1]).filter((l) => l !== 'carried');
  for (const f of readdirSync(TOOLS)) if (/^gates\.r5\.zz-autodiscover-probe-/.test(f)) rmSync(path.join(TOOLS, f), { force: true });
  const tag = `zz-autodiscover-probe-${process.pid}`;
  const good = path.join(TOOLS, `gates.r5.${tag}.mjs`);
  const bad = path.join(TOOLS, `gates.r5.${tag}-broken.mjs`);
  const probeId = `ZZ-${tag}`;
  let out, outCarried = { json: null };
  try {
    writeFileSync(good, `export const GATES = [
  { id: 'A1-boot-clean', kind: 'runner', lane: '${tag}', title: 'shadow probe', check: () => ({ pass: true, detail: 'probe' }) },
  { id: '${probeId}', kind: 'runner', lane: '${tag}', title: 'new-id probe', check: () => ({ pass: true, detail: 'probe' }) },
];\n`);
    writeFileSync(bad, `export const GATES = [ this is not javascript ;\n`);
    out = childJSON(`
      const m = await import(${JSON.stringify(pathToFileURL(cfgPath).href)} + '?t=' + Date.now());
      const pick = (id) => { const g = m.GATES.find((x) => x.id === id); return g ? { id, source: g.source, lane: g.lane, shadows: g.shadows || null } : null; };
      console.log('JSON ' + JSON.stringify({
        n: m.GATES.length, laneFiles: m.LANE_FILES, shadowed: m.SHADOWED.filter((s) => s.by.includes(${JSON.stringify(tag)})),
        a1: pick('A1-boot-clean'), probe: pick(${JSON.stringify(probeId)}),
        loadFail: m.GATES.filter((g) => String(g.id).startsWith('LOAD-FAIL:') && g.id.includes(${JSON.stringify(tag)})).map((g) => ({ id: g.id, lane: g.lane, kind: g.kind })),
        carried: m.GATES.filter((g) => g.source === 'gates.r5.carried.mjs').length,
      }));`);
    // the same registry as `gates.mjs --lane carried` builds it: the shadowing row must run there too
    outCarried = childJSON(`
      process.argv.push('--lane', 'carried');
      const m = await import(${JSON.stringify(pathToFileURL(cfgPath).href)} + '?t=' + Date.now());
      const g = m.GATES.find((x) => x.id === 'A1-boot-clean');
      console.log('JSON ' + JSON.stringify({ a1: g ? { source: g.source, lane: g.lane, shadowLane: g.shadowLane || null } : null }));`);
  } finally {
    rmSync(good, { force: true });
    rmSync(bad, { force: true });
  }
  const j = out.json || {};
  const checks = {
    configLoadsByPattern: byPattern,
    configNamesNoLaneFile: namesALane.length === 0,
    newLaneFileDiscovered: !!j.laneFiles && j.laneFiles.includes(path.basename(good)),
    newIdRegistered: !!j.probe && j.probe.source === path.basename(good),
    laneRowShadowsCarriedById: !!j.a1 && j.a1.source === path.basename(good) && j.a1.shadows === 'gates.r5.carried.mjs'
      && (j.shadowed || []).some((s) => s.id === 'A1-boot-clean'),
    brokenLaneFileIsAFailRow: (j.loadFail || []).some((r) => r.kind === 'runner' && r.lane === `${tag}-broken`),
    shadowRowRunsInCarriedSuite: !!outCarried.json?.a1 && outCarried.json.a1.source === path.basename(good)
      && outCarried.json.a1.lane === 'carried' && outCarried.json.a1.shadowLane === tag,
    probeFilesRemoved: !existsSync(good) && !existsSync(bad),
  };
  return { pass: Object.values(checks).every(Boolean) && out.status === 0, detail: { checks, child: j, childStatus: out.status, childStderr: out.stderr || undefined,
    underLaneCarried: outCarried.json } };
}

/* ------------------------------------------------------------------------ */
/* A-port-guard                                                              */
/* ------------------------------------------------------------------------ */
/** A preload that records (and blocks) every socket connect and child spawn the harness attempts. */
function socketTrap(dir) {
  const log = path.join(dir, 'trap.log');
  const file = path.join(dir, 'trap.mjs');
  writeFileSync(file, `
import net from 'net'; import cp from 'child_process'; import { appendFileSync } from 'fs'; import { syncBuiltinESMExports } from 'module';
const L = ${JSON.stringify(log)};
const note = (what) => { try { appendFileSync(L, what + '\\n'); } catch {} };
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...a) { note('connect ' + JSON.stringify(a[0]).slice(0, 80)); this.destroy(new Error('trap: no sockets')); return this; };
const wrapSpawn = (k) => { cp[k] = function (...a) { note(k + ' ' + String(a[0]).slice(0, 60)); throw new Error('trap: no child processes'); }; };
wrapSpawn('spawn'); wrapSpawn('exec'); wrapSpawn('execFile'); wrapSpawn('fork'); wrapSpawn('spawnSync'); wrapSpawn('execSync'); wrapSpawn('execFileSync');
// the harnesses import { spawn } from 'child_process' (ESM named imports): without this sync they keep
// the ORIGINAL functions and a spawn escapes the trap (observed: the control run left an orphan Vite)
syncBuiltinESMExports();
`);
  return { file, log };
}
function runGuarded(harness, args, env, trap) {
  try { rmSync(trap.log, { force: true }); } catch { /* fresh */ }
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--import', pathToFileURL(trap.file).href, path.join(TOOLS, harness), ...args], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, env,
  });
  const trapped = existsSync(trap.log) ? read(trap.log).trim().split('\n').filter(Boolean) : [];
  return { harness, args: args.join(' '), pid: r.pid, status: r.status, signal: r.signal, ms: Date.now() - t0,
    refusedLoudly: /port-guard\] refused/.test(r.stderr || ''), socketsOrSpawns: trapped,
    stderr: (r.stderr || '').split('\n').filter((l) => /port-guard/.test(l)).slice(0, 1).join('') };
}
async function portGuard({ PORT }) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'cal-port-guard-'));
  const trap = socketTrap(dir);
  const base = { ...process.env };
  delete base.SHOT_PORT;
  const rows = [];
  try {
    for (const h of ['gates.mjs', 'screenshot.mjs']) {
      const extra = h === 'gates.mjs' ? ['--only', 'A1-boot-clean'] : ['port-guard-probe'];
      rows.push({ case: 'no --port, SHOT_PORT unset', ...runGuarded(h, extra, base, trap) });
      rows.push({ case: '--port 5173', ...runGuarded(h, [...extra, '--port', '5173'], base, trap) });
      rows.push({ case: 'SHOT_PORT=5173', ...runGuarded(h, extra, { ...base, SHOT_PORT: '5173' }, trap) });
      for (const bad of ['5249', '5300', '5275', '80', 'abc']) rows.push({ case: `--port ${bad}`, ...runGuarded(h, [...extra, '--port', bad], base, trap) });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  // POSITIVE CONTROL: the same trap on an ACCEPTED port must see the harness reach for a socket,
  // or "0 sockets before refusing" above would be a blind instrument's zero
  const dir2 = mkdtempSync(path.join(os.tmpdir(), 'cal-port-guard-ctl-'));
  // every process the control harness could leave behind: a Vite on this port (new since the control
  // started), or a Chrome on the control's OWN profile (cal-<control pid>-…), so a concurrent gate run's
  // Chrome relaunching in the same window is never counted as the control's leak
  const psList = () => (spawnSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' }).stdout || '').split('\n').filter((l) => !/ps -axww/.test(l));
  const vitesOnPort = () => psList().filter((l) => new RegExp('vite --port ' + PORT + '\\b').test(l)).map((l) => +l.trim().split(/\s+/)[0]);
  const before = new Set(vitesOnPort());
  let control;
  try { control = runGuarded('screenshot.mjs', ['port-guard-control', '--port', String(PORT)], base, socketTrap(dir2)); }
  finally { rmSync(dir2, { recursive: true, force: true }); }
  const leaked = [...vitesOnPort().filter((pid) => !before.has(pid)),
    ...psList().filter((l) => /Chrome for Testing/.test(l) && control.pid && l.includes(`cal-${control.pid}-`)).map((l) => +l.trim().split(/\s+/)[0])];
  const trapSees = control.socketsOrSpawns.some((l) => l.startsWith('connect')) && leaked.length === 0;
  const refused = trapSees && rows.every((r) => r.status !== 0 && r.status !== null && r.refusedLoudly && r.socketsOrSpawns.length === 0);
  // the accept side, in-process (no socket): the lane, orchestrator and judge ranges pass
  const { guardPort } = await import('./chrome-profile.mjs');
  const accepted = ['5250', '5255', '5269', '5270', '5271', '5280', '5299'].map((p) => guardPort(p));
  const acceptOk = accepted.join(',') === '5250,5255,5269,5270,5271,5280,5299';
  /*
   * THE LSOF HALF (fix round 3, judge finding: "passes on a watch log that never covered the run").
   * Graded from the run monitors (see "the run monitor" below), never from a log's freshness:
   *   (a) THIS invocation's own monitor, sampled once more right now, must cover it from process start
   *       to this moment with no gap > 10 s, and its process tree must hold 0 connections to :5173;
   *       A-port-guard is the LAST row of this block, so in a lane run that window holds every other
   *       gate of the block (A-chrome-semaphore's four child gate runs and their Chromes included);
   *   (b) every sealed carried run of this tree and port on the current build (the runs A-carried-suite
   *       grades) must carry its own monitor covering startedAt..endedAt the same way;
   *   (c) an external --watch-5173 log counts only when named (CAL_PORT_WATCH), and then it must have
   *       started before everything it vouches for and still be live (updated within 10 s).
   * The block is a full lane run, or at least one sealed carried run is vouched for; else PENDING.
   */
  const nowMs = Date.now();
  const MON = await freshMonitor(nowMs);
  const cover = (mon, fromMs, toMs) => {
    const why = [];
    if (!mon) return { ok: false, why: ['no run monitor in this process (not a gates.mjs run of this tree on an allowed port)'] };
    if (mon.coveredByAncestor) return { ok: false, why: ['this process is covered by its parent run\'s monitor (pid ' + mon.coveredByAncestor + '), not by its own'] };
    if (mon.sampler !== 'worker_thread') return { ok: false, why: ['monitor v' + (mon.version || 1) + ' sampled on the main event loop (blind while the main thread blocks); fix round 3 needs the worker-thread sampler'] };
    const s0 = mon.startedAtMs ?? Date.parse(mon.startedAt), s1 = mon.lastAtMs ?? Date.parse(mon.lastAt);
    // the first sample must open the window: within 10 s of its start, or taken while the run had not yet
    // started a single child (no Vite, no Chrome: nothing of this run could connect anywhere before it)
    if (!(s0 <= fromMs + MONITOR_MAX_GAP_MS) && mon.childrenAtFirstSample !== 0) why.push(`first sample ${isoOf(s0)} is more than 10 s after the window start ${isoOf(fromMs)} and the run already had ${mon.childrenAtFirstSample} child process(es)`);
    if (!(s1 >= toMs - MONITOR_MAX_GAP_MS)) why.push(`last sample ${isoOf(s1)} is more than 10 s before the window end ${isoOf(toMs)}`);
    if (!(mon.maxGapMs <= MONITOR_MAX_GAP_MS)) why.push(`a ${mon.maxGapMs} ms gap between clean samples (max ${MONITOR_MAX_GAP_MS})`);
    if ((mon.gateConnectionCount || 0) > 0) why.push(`${mon.gateConnectionCount} sample(s) saw a process of this run connected to :5173`);
    return { ok: why.length === 0, why, window: [isoOf(fromMs), isoOf(toMs)], firstSample: isoOf(s0), lastSample: isoOf(s1), samples: mon.samples,
      childrenAtFirstSample: mon.childrenAtFirstSample, maxGapMs: mon.maxGapMs, failedSamples: mon.errors, gateConnections: mon.gateConnectionCount || 0, firstConnections: (mon.gateConnections || []).slice(0, 3),
      otherRunsConnections: mon.otherGateProcessConnections || 0, box: mon.box, mainCacheChanges: mon.mainViteCache?.changes || [] };
  };
  const live = cover(MON, PROCESS_START_MS, nowMs);
  const onlyF = argFlag('--only', null), laneF = argFlag('--lane', null);
  const fullLaneRun = IS_GATES_RUN && !onlyF && (!laneF || laneF === LANE);
  const Lg = readLedger();
  const cfgNow = await import('./gates.config.mjs');
  const fp = buildFingerprint(shadowFilesOf(cfgNow));
  const freshSeals = Lg.ok ? sealsOfTree(Lg, { port: PORT }, fp, gitHead()).filter((c) => !c.why.length) : [];
  const sealed = freshSeals.map((c) => {
    const sl = c.seal;
    let mon = null, why = null;
    try { const b = readFileSync(path.join(LEDGER_RUNS, sl.sealId, 'monitor.json')); if (sha256(b) !== sl.monitorSha256) why = 'its monitor copy does not match the seal'; else mon = JSON.parse(b); }
    catch { why = 'no monitor copy in the ledger'; }
    return { sealId: sl.sealId, ...(mon ? cover(mon, Date.parse(sl.startedAt), Date.parse(sl.endedAt)) : { ok: false, why: [why] }) };
  });
  let external = null;
  if (process.env.CAL_PORT_WATCH) {
    let w = null;
    try { w = JSON.parse(read(process.env.CAL_PORT_WATCH)); } catch { w = null; }
    const why = [];
    const mustStartBy = Math.min(PROCESS_START_MS, ...freshSeals.map((c) => Date.parse(c.seal.startedAt)));
    if (!w) why.push('unreadable');
    else {
      if (!(Date.parse(w.started) <= mustStartBy)) why.push(`started ${w.started}, after the earliest window it vouches for (${isoOf(mustStartBy)})`);
      if (!(nowMs - Date.parse(w.updated) <= MONITOR_MAX_GAP_MS)) why.push(`not live: last updated ${w.updated}, ${Math.round((nowMs - Date.parse(w.updated)) / 1000)} s before grading (max 10 s)`);
      if ((w.gateConnections || []).length) why.push(`${w.gateConnections.length} gate connection(s) to :5173`);
      if (w.errors) why.push(`${w.errors} failed sample(s)`);
      if (!w.mainViteCache?.file) why.push('predates the cache half (no mainViteCache)');
    }
    external = { file: process.env.CAL_PORT_WATCH, ok: why.length === 0, why, started: w?.started, updated: w?.updated, samples: w?.samples,
      gateConnections: w?.gateConnections?.length ?? null, mainViteCache: w?.mainViteCache };
  }
  const lsofControl = await lsofPositiveControl();
  const lsofFail = !lsofControl.ok || !live.ok || sealed.some((x) => !x.ok) || (external && !external.ok);
  const lsofScope = fullLaneRun || sealed.length > 0;
  // the dependency-cache half (judge finding, Oct 15): Kevin's 5173 server reads the MAIN repo's
  // node_modules/.vite. (a) static: no lane tree's Vite cacheDir may resolve into the main repo;
  // (b) over every monitored window: no rewrite of main's _metadata.json carries THIS tree's configHash
  // (Vite hashes the config root into configHash, so a rewrite is attributable to its tree)
  const cache = viteCacheFacts();
  const myHash = cache.thisTreeConfigHash;
  const mainRewrites = [...(live.mainCacheChanges || []), ...sealed.flatMap((x) => x.mainCacheChanges || []), ...(external?.mainViteCache?.changes || [])];
  const byThisTree = myHash ? mainRewrites.filter((c) => c.configHash === myHash) : [];
  const cacheOk = cache.ok && byThisTree.length === 0;
  const pass = !(refused && acceptOk && cache.ok) ? false : (lsofFail || !cacheOk) ? false : lsofScope ? true : null;
  return { pass, detail: {
    verdict: !refused || !acceptOk ? 'FAIL: a harness accepted a refused port, refused silently, or touched a socket/child before refusing'
      : !cache.ok ? 'FAIL: ' + cache.why
      : lsofFail ? 'FAIL: the lsof half: ' + [!lsofControl.ok ? 'the positive control saw ' + lsofControl.connectionsSeen + ' connection(s) to its own scratch listener in ' + lsofControl.samples + ' samples (the instrument is blind)' : null,
          !live.ok ? 'this invocation: ' + live.why.join('; ') : null,
          ...sealed.filter((x) => !x.ok).map((x) => x.sealId + ': ' + x.why.join('; ')),
          external && !external.ok ? 'CAL_PORT_WATCH ' + external.file + ': ' + external.why.join('; ') : null].filter(Boolean).join(' | ')
      : !cacheOk ? 'FAIL: this tree\'s Vite rewrote the main repo\'s dependency cache (' + byThisTree.length + ' rewrite(s) with configHash ' + myHash + ') inside a monitored window'
      : !lsofScope ? 'PENDING: refusals, cache and this invocation\'s monitor PASS, but this invocation is not a full lane run (--only/--lane) and no sealed carried run of this build exists to vouch for one'
      : 'PASS: ' + rows.length + ' refusals; lsof control saw its own connection (' + lsofControl.connectionsSeen + ' sample(s)); 0 connections to :5173 from this run\'s process tree over ' + live.samples + ' samples (' + live.window.join(' .. ') + ', max gap ' + live.maxGapMs + ' ms)'
        + (sealed.length ? ' and over ' + sealed.length + ' sealed carried run(s): ' + sealed.map((x) => x.sealId + ' (' + x.samples + ' samples, max gap ' + x.maxGapMs + ' ms)').join(', ') : '')
        + (fullLaneRun ? '; this invocation is a full lane run' : ''),
    refusals: rows, trapControl: { port: PORT, saw: control.socketsOrSpawns.slice(0, 3), trapSees, leakedProcesses: leaked },
    acceptedPorts: accepted, allowed: '5250-5271, 5280-5299 (5173 never; 5272-5279 reserved)',
    lsof: { positiveControl: lsofControl, thisInvocation: { ...live, mainCacheChanges: undefined, fullLaneRun }, sealedCarriedRuns: sealed.map((x) => ({ ...x, mainCacheChanges: undefined })),
      external: external ? { ...external, mainViteCache: undefined } : 'not used (set CAL_PORT_WATCH to grade an external --watch-5173 log too)' },
    viteCache: { ...cache, mainRewritesInMonitoredWindows: mainRewrites.length, mainRewritesByThisTree: byThisTree,
      mainAtStart: MON?.mainViteCache?.atStart || null, mainNow: MON?.mainViteCache?.last || null,
      // reported, not graded (it predates the watched runs): main's cache as found was last written by a Vite
      // rooted at THIS tree, i.e. before the tree had its own cacheDir; Kevin's 5173 server may need a restart
      mainLastWrittenByThisTreeBeforeTheRun: !!myHash && MON?.mainViteCache?.atStart?.configHash === myHash },
  } };
}

/** The main repo (the git common dir's parent) and this tree's resolved Vite cacheDir, both real paths. */
function viteCacheFacts() {
  const realOf = (p) => { let cur = p; const rest = []; while (!existsSync(cur) && path.dirname(cur) !== cur) { rest.unshift(path.basename(cur)); cur = path.dirname(cur); } return path.join(realpathSync(cur), ...rest); };
  const git = spawnSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  const main = git.status === 0 ? realpathSync(path.dirname(git.stdout.trim())) : null;
  const out = childJSON(`
    const { resolveConfig } = await import('vite');
    const c = await resolveConfig({ root: ${JSON.stringify(ROOT)}, logLevel: 'silent' }, 'serve');
    console.log('JSON ' + JSON.stringify({ cacheDir: c.cacheDir }));`);
  const cacheDir = out.json?.cacheDir || null;
  const cacheReal = cacheDir ? realOf(cacheDir) : null;
  const isMainTree = !!main && realpathSync(ROOT) === main;
  const inMain = !!main && !!cacheReal && (cacheReal === main || cacheReal.startsWith(main + path.sep));
  // every OTHER worktree of the repo too (judge finding, Oct 16: "give every worktree its own
  // cacheDir"): a lane tree whose node_modules/.vite resolves into the main repo rewrites the
  // dependency cache Kevin's 5173 server reads, from whichever tree runs Vite first
  const wt = spawnSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const worktrees = (wt.stdout || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9))
    .filter((t) => { try { return !main || realpathSync(t) !== main; } catch { return false; } })
    .map((t) => {
      const real = realOf(path.join(t, 'node_modules', '.vite'));
      return { tree: t, viteCache: real, sharesMainCache: !!main && (real === main || real.startsWith(main + path.sep)) };
    });
  const sharing = worktrees.filter((w) => w.sharesMainCache);
  const ok = !!main && !!cacheReal && (isMainTree || !inMain) && sharing.length === 0;
  const meta = (dir) => { try { const j = JSON.parse(read(path.join(dir, 'deps', '_metadata.json'))); return { configHash: j.configHash, hash: j.hash, browserHash: j.browserHash }; } catch { return null; } };
  return { ok, why: !main ? 'git common dir not found' : !cacheReal ? 'Vite cacheDir did not resolve (' + (out.stderr || '').slice(0, 200) + ')'
      : !(isMainTree || !inMain) ? 'this worktree\'s Vite cacheDir ' + cacheReal + ' resolves into the main repo ' + main + ' (Kevin\'s 5173 dependency cache); give the tree its own cacheDir'
      : sharing.length ? 'worktree(s) ' + sharing.map((w) => w.tree).join(', ') + ' resolve node_modules/.vite into the main repo (Kevin\'s 5173 dependency cache)' : null,
    mainRepo: main, isMainTree, cacheDir, cacheDirReal: cacheReal, worktrees,
    thisTreeConfigHash: cacheReal ? (meta(cacheReal)?.configHash || null) : null,
    mainCache: main ? { dir: path.join(main, 'node_modules', '.vite'), ...(meta(path.join(main, 'node_modules', '.vite')) || {}),
      ...mainCacheProvenance(path.join(main, 'node_modules', '.vite', 'deps')) } : null };
}

/**
 * Reported, not graded (it predates any run): who last optimized main's deps. esbuild writes each
 * bundled module's path RELATIVE TO THE OPTIMIZING VITE'S CWD into a `// <path>` comment, so a
 * comment starting `../` was written by a Vite running outside the main tree. The chunk files are
 * content-hashed: a different writer means different chunk names than the 5173 server's own.
 */
function mainCacheProvenance(deps) {
  try {
    const metaJ = JSON.parse(read(path.join(deps, '_metadata.json')));
    const missing = [...Object.values(metaJ.optimized || {}), ...Object.values(metaJ.chunks || {})].map((v) => v.file).filter((f) => !existsSync(path.join(deps, f)));
    let first = null;
    for (const v of [...Object.values(metaJ.chunks || {}), ...Object.values(metaJ.optimized || {})]) {
      try { first = (/^\/\/ (\S+)/m.exec(read(path.join(deps, v.file))) || [])[1] || null; } catch { first = null; }
      if (first) break;
    }
    return { writtenByAViteOutsideMain: !!first && first.startsWith('../'), sampleModuleComment: first && first.slice(0, 90),
      optimized: Object.keys(metaJ.optimized || {}).length, chunks: Object.keys(metaJ.chunks || {}).length, filesMissing: missing };
  } catch (e) { return { provenanceError: String(e.message).slice(0, 120) }; }
}

/** CLI: sample lsof every 2 s; record any GATE process (node harness, Chrome for Testing, vite) connected to :5173. */
async function watch5173(out, seconds) {
  const started = new Date().toISOString();
  const state = { started, updated: started, everyMs: 2000, samples: 0, errors: 0, gateConnections: [], otherClients: {} };
  // main repo's Vite dependency cache (A-port-guard's cache half): every rewrite, with its configHash
  const git = spawnSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  const metaFile = git.status === 0 ? path.join(path.dirname(git.stdout.trim()), 'node_modules', '.vite', 'deps', '_metadata.json') : null;
  const readMeta = () => { try { const st = statSync(metaFile); const j = JSON.parse(read(metaFile)); return { mtime: new Date(st.mtimeMs).toISOString(), configHash: j.configHash, hash: j.hash, browserHash: j.browserHash }; } catch { return null; } };
  state.mainViteCache = { file: metaFile, atStart: readMeta(), last: null, changes: [] };
  state.mainViteCache.last = state.mainViteCache.atStart;
  const until = seconds ? Date.now() + seconds * 1000 : Infinity;
  let stop = false;
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stop = true; });
  const cmdOf = (pid) => spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  const isGate = (cmd) => /Chrome for Testing|chrome-headless|gates\.mjs|screenshot\.mjs|gates\.r5\.|chrome-profile/.test(cmd)
    || (/vite/.test(cmd) && /--strictPort/.test(cmd) && !/--port 5173\b/.test(cmd));
  while (!stop && Date.now() < until) {
    const r = spawnSync('lsof', ['-nP', '-iTCP:5173', '-sTCP:ESTABLISHED', '-F', 'pcn'], { encoding: 'utf8', timeout: 10000 });
    if (r.status !== 0 && r.status !== 1) state.errors++;
    let pid = null;
    for (const line of (r.stdout || '').split('\n')) {
      if (line[0] === 'p') pid = +line.slice(1);
      if (line[0] === 'n' && pid && /->[^ ]*:5173$/.test(line)) {      // this process is the CLIENT end
        const cmd = cmdOf(pid);
        if (isGate(cmd)) state.gateConnections.push({ at: new Date().toISOString(), pid, cmd: cmd.slice(0, 160), conn: line.slice(1) });
        else state.otherClients[cmd.split(' ')[0].slice(-60)] = (state.otherClients[cmd.split(' ')[0].slice(-60)] || 0) + 1;
      }
    }
    const mm = metaFile ? readMeta() : null;
    const lm = state.mainViteCache.last;
    if (mm && (!lm || mm.mtime !== lm.mtime || mm.hash !== lm.hash)) { state.mainViteCache.changes.push({ at: new Date().toISOString(), ...mm }); state.mainViteCache.last = mm; }
    state.samples++;
    state.updated = new Date().toISOString();
    try { writeFileSync(out + '.tmp', JSON.stringify(state, null, 1)); renameSync(out + '.tmp', out); } catch { state.errors++; }
    await sleep(2000);
  }
}

/* ------------------------------------------------------------------------ */
/* A-chrome-semaphore                                                        */
/* ------------------------------------------------------------------------ */
const chromeMains = (sandbox) => {
  const r = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return (r.stdout || '').split('\n').filter((l) => /Chrome for Testing|chrome-headless-shell/.test(l) && !/--type=/.test(l)
    && l.includes(`--user-data-dir=${sandbox}`)).length;
};
/** live stand-in "Chromes": the sleeper a holder spawns once it has a slot (the holder's own command line
 *  carries the token too, inside its -e source, so it is excluded by its acquire call) */
const countMatching = (token) => {
  const r = spawnSync('ps', ['-axww', '-o', 'command='], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return (r.stdout || '').split('\n').filter((l) => l.includes(token) && !l.includes('acquireChromeSlot') && !l.includes('ps -axww')).length;
};
/**
 * W0b fix round 1 (judge finding: A-chrome-semaphore FAILed once in a lane run because the tree's report files
 * changed inside its window, then PASSED alone). The fingerprint could not say WHO wrote them, and its restore()
 * would have overwritten a concurrent same-tree run's legitimate report with a stale copy. R33 (d)'s claim is about
 * the semaphore's CHILDREN, so the children now run with a write tracer preloaded through NODE_OPTIONS (inherited by
 * every node descendant, the harness's worker-thread monitor included): every filesystem write call any child makes
 * (write / append / copy / rename / rm / unlink / utimes / truncate / mkdir / cp / symlink / link / open for writing /
 * createWriteStream, sync, callback and promise forms) is logged with its pid and resolved path. The gate grades the
 * log: 0 writes into this tree, and a POSITIVE CONTROL (every real child run's report.p<PORT>.json write is seen in the
 * sandbox, so the tracer is not blind). The tree's report files are still fingerprinted, now as ATTRIBUTION: a change
 * the tracer does not trace to a child is another process's run in this tree (named from the new report's own port,
 * stamp and gate ids) and is reported, never "restored"; a change a child made is restored and FAILs.
 */
function writeTracer(dir) {
  const log = path.join(dir, 'writes.log');
  const file = path.join(dir, 'write-tracer.mjs');
  writeFileSync(file, `
import fs from 'fs'; import path from 'path'; import { syncBuiltinESMExports } from 'module'; import { fileURLToPath } from 'url';
const L = ${JSON.stringify(log)};
// one fd opened BEFORE anything is wrapped; fs.writeSync is never wrapped, so the log cannot trace itself
const FD = fs.openSync(L, 'a');
let depth = 0;     // a wrapped call made from inside another (appendFileSync -> writeFileSync) is not logged twice
const P = (p) => { try { if (p instanceof URL) return fileURLToPath(p); if (Buffer.isBuffer(p)) return p.toString(); return typeof p === 'string' ? path.resolve(p) : null; } catch { return null; } };
const note = (op, p) => { const r = P(p); if (r === null) return; try { fs.writeSync(FD, JSON.stringify({ pid: process.pid, op, path: r }) + '\\n'); } catch {} };
const TWO = new Set(['copyFileSync', 'renameSync', 'cpSync', 'symlinkSync', 'linkSync', 'copyFile', 'rename', 'cp', 'symlink', 'link']);
const ONE = ['writeFileSync', 'appendFileSync', 'rmSync', 'rmdirSync', 'unlinkSync', 'utimesSync', 'lutimesSync', 'truncateSync', 'mkdirSync', 'mkdtempSync', 'chmodSync',
  'writeFile', 'appendFile', 'rm', 'rmdir', 'unlink', 'utimes', 'lutimes', 'truncate', 'mkdir', 'mkdtemp', 'chmod', 'createWriteStream', ...TWO];
const writeFlag = (f) => (typeof f === 'string' && !/^rs?$/.test(f)) || (typeof f === 'number' && (f & 3) !== 0);
const wrapIn = (obj, k, isPromise) => { const real = obj[k]; if (typeof real !== 'function') return;
  obj[k] = function (...a) {
    if (depth === 0) { note((isPromise ? 'promises.' : '') + k, a[0]); if (TWO.has(k)) note((isPromise ? 'promises.' : '') + k + ':dest', a[1]); }
    depth++; try { return real.apply(this, a); } finally { depth--; }
  }; };
for (const k of ONE) wrapIn(fs, k, false);
for (const k of ['writeFile', 'appendFile', 'rm', 'rmdir', 'unlink', 'utimes', 'truncate', 'mkdir', 'mkdtemp', 'copyFile', 'rename', 'cp', 'symlink', 'link', 'chmod']) wrapIn(fs.promises, k, true);
for (const [obj, k, pre] of [[fs, 'openSync', ''], [fs, 'open', ''], [fs.promises, 'open', 'promises.']]) {
  const real = obj[k]; if (typeof real !== 'function') continue;
  obj[k] = function (p, flags, ...a) { if (depth === 0 && writeFlag(flags)) note(pre + k + ':' + flags, p); depth++; try { return real.call(this, p, flags, ...a); } finally { depth--; } };
}
syncBuiltinESMExports();
`);
  return { file, log, nodeOptions: `--import=${pathToFileURL(file).href}` };
}
/** every traced write, with its real path (the nearest existing ancestor resolved, so a symlinked tree path matches) */
function readTrace(log) {
  const realOf = (q) => { let cur = q; const rest = []; while (!existsSync(cur) && path.dirname(cur) !== cur) { rest.unshift(path.basename(cur)); cur = path.dirname(cur); } try { return path.join(realpathSync(cur), ...rest); } catch { return q; } };
  let lines = [];
  try { lines = read(log).split('\n').filter(Boolean); } catch { lines = []; }
  return lines.map((l) => { try { const e = JSON.parse(l); return { ...e, real: realOf(e.path) }; } catch { return null; } }).filter(Boolean);
}

function spawnLogged(args, env, cwd = ROOT) {
  const ch = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const rec = { out: '', err: '', code: null, done: null };
  ch.stdout.on('data', (d) => { rec.out += d; });
  ch.stderr.on('data', (d) => { rec.err += d; });
  rec.done = new Promise((res) => ch.on('exit', (code, sig) => { rec.code = code; rec.signal = sig; res(); }));
  rec.child = ch;
  return rec;
}
async function sampleWhile(promises, fn, everyMs = 100) {
  let max = 0, n = 0, settled = false;
  Promise.all(promises).then(() => { settled = true; });
  while (!settled) { const v = fn(); max = Math.max(max, v); n++; await sleep(everyMs); }
  return { max, samples: n };
}
/**
 * R33 (d): no report file may be overwritten by a semaphore child. The child runs are REAL `gates.mjs`
 * runs of this tree's harness, but they now run with their cwd in the gate's sandbox, so their
 * `shots/gates/*` (reports and the A1 frame) land there, never in the tree. The tree's files are
 * fingerprinted (sha256 + mtime) before and after: any change FAILs the gate (and is put back).
 */
function keepTreeReports(PORT) {
  const files = [`report.p${PORT}.json`, `report.p${PORT}.md`, 'report.json', 'report.md', 'A1-boot-clean.png']
    .map((f) => path.join(ROOT, 'shots', 'gates', f));
  const kept = files.map((f) => { try { const st = statSync(f); const buf = readFileSync(f); return { f, buf, sha: sha256(buf), atime: st.atime, mtime: st.mtime, mtimeMs: st.mtimeMs }; } catch { return { f, buf: null }; } });
  /** who wrote a changed report: its own payload (gates.mjs writes { stamp, port, results }) */
  const authorOf = (f) => {
    if (!/\.json$/.test(f)) return null;
    try { const j = JSON.parse(read(f)); return { port: j.port, stamp: j.stamp, gates: (j.results || []).length, ids: (j.results || []).map((r) => r.id).slice(0, 6) }; } catch { return { unparseable: true }; }
  };
  return {
    files,
    unchanged() {
      return kept.map((k) => {
        let now = null;
        try { const st = statSync(k.f); now = { sha: sha256(readFileSync(k.f)), mtimeMs: st.mtimeMs }; } catch { now = null; }
        const same = k.buf ? !!now && now.sha === k.sha && now.mtimeMs === k.mtimeMs : !now;
        return { file: rel(k.f), abs: k.f, unchanged: same, ...(same ? {} : { nowWrittenBy: authorOf(k.f), mtimeNow: now ? new Date(now.mtimeMs).toISOString() : 'deleted' }) };
      });
    },
    /** put back ONLY the files a semaphore child is traced writing (another run's report is never overwritten) */
    restore(onlyAbs) {
      const out = [];
      for (const k of kept) {
        if (onlyAbs && !onlyAbs.has(k.f)) continue;
        if (k.buf) { writeFileSync(k.f, k.buf); utimesSync(k.f, k.atime, k.mtime); out.push(rel(k.f) + ' restored'); }
        else if (existsSync(k.f)) { rmSync(k.f, { force: true }); out.push(rel(k.f) + ' removed (did not exist before)'); }
      }
      return out;
    },
  };
}

async function chromeSemaphore({ PORT }) {
  const sandbox = mkdtempSync(path.join(os.tmpdir(), 'cal-sem-'));
  const profileRoot = path.join(sandbox, 'root');
  const tracer = writeTracer(sandbox);
  const nodeOptions = [process.env.NODE_OPTIONS, tracer.nodeOptions].filter(Boolean).join(' ');
  const env = (slots, extra = {}) => ({ ...process.env, NODE_OPTIONS: nodeOptions, CAL_CHROME_PROFILE_ROOT: profileRoot, CAL_CHROME_SLOTS: String(slots), SHOT_PORT: String(PORT), ...extra });
  const out = {};
  const keep = keepTreeReports(PORT);
  const tree = realpathSync(ROOT);
  const childCwd = path.join(sandbox, 'cwd');   // the child runs' shots/ and reports land here (R33 d)
  // the harness probes 127.0.0.1 only and spawns `npx vite` when it sees nothing (this box's Vite binds ::1); in a
  // directory with no local vite, npx would DOWNLOAD one. A local no-op `vite` makes that spawn exit at once:
  // nothing is installed, no dependency cache is written, and the page still loads from this lane's Vite.
  mkdirSync(path.join(childCwd, 'node_modules', '.bin'), { recursive: true });
  writeFileSync(path.join(childCwd, 'package.json'), '{ "private": true }\n');
  writeFileSync(path.join(childCwd, 'node_modules', '.bin', 'vite'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  try {
    // never alongside a Chrome of our own parent run (W0a: one Chrome per agent until this is merged)
    const own = spawnSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' }).stdout.split('\n')
      .filter((l) => /Chrome for Testing/.test(l) && !/--type=/.test(l) && new RegExp(`^\\s*\\d+\\s+${process.pid}\\s`).test(l)).length;
    if (own) return { pass: null, detail: 'PENDING: the parent run holds a Chrome; run this gate in a runner-only invocation (--only A-chrome-semaphore)' };
    // Vite binds localhost, which is ::1 only on this box: probe both loopbacks
    const up = (host) => new Promise((res) => { const s = net.connect(PORT, host); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    const viteUp = (await up('::1')) || (await up('127.0.0.1'));
    if (!viteUp) return { pass: null, detail: `PENDING: no Vite on ${PORT}; the real-Chrome phase needs one (npx vite --port ${PORT} --strictPort)` };

    /* (a) four REAL gate runs at once. W0a runs it at 1 slot (the one-Chrome-per-agent rule until this
     *     lands); CAL_SEMAPHORE_REAL_SLOTS=2 runs it at the machine-wide default. */
    const realSlots = Math.min(2, Math.max(1, Number(process.env.CAL_SEMAPHORE_REAL_SLOTS) || 1));
    const runs = [0, 1, 2, 3].map(() => spawnLogged([path.join(TOOLS, 'gates.mjs'), '--port', String(PORT), '--only', 'A1-boot-clean'], env(realSlots), childCwd));
    const a = await sampleWhile(runs.map((r) => r.done), () => chromeMains(profileRoot));
    out.realRuns = { slots: realSlots, runs: runs.map((r) => ({ code: r.code, pass: /\[PASS\] A1-boot-clean/.test(r.out), waited: /\[semaphore\] waiting/.test(r.out) })),
      maxChromeAlive: a.max, samples: a.samples };
    out.realOk = a.max >= 1 && a.max <= realSlots && runs.every((r) => r.code === 0 && /\[PASS\] A1-boot-clean/.test(r.out));

    /* (b) the default 2 slots with stand-ins: 4 holders through the real acquire path; at most 2 alive, and 2 at once */
    const token = `cal-standin-${process.pid}`;
    const cpUrl = pathToFileURL(path.join(TOOLS, 'chrome-profile.mjs')).href;
    const holder = (holdMs) => `
      const m = await import(${JSON.stringify(cpUrl)});
      await m.acquireChromeSlot();
      const { spawn } = await import('child_process');
      const c = spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${holdMs})', ${JSON.stringify(token)}], { stdio: 'ignore' });
      await new Promise((r) => c.on('exit', r));`;
    const hs = [0, 1, 2, 3].map(() => spawnLogged(['--input-type=module', '-e', holder(1500)], env(2)));
    const b = await sampleWhile(hs.map((h) => h.done), () => countMatching(token));
    const semDir = path.join(profileRoot, 'chrome-semaphore');
    const left = existsSync(semDir) ? readdirSync(semDir).filter((f) => /^\d+$/.test(f)) : [];
    out.standins = { slots: 2, codes: hs.map((h) => h.code), maxAlive: b.max, samples: b.samples, ticketsLeftAfterExit: left.length };
    out.standinOk = b.max === 2 && hs.every((h) => h.code === 0) && left.length === 0;

    /* (c) released on SIGKILL: A holds the only slot; B waits; kill -9 A; B gets it */
    const holdA = spawnLogged(['--input-type=module', '-e', `${holder(30000)}`], env(1));
    let t0 = Date.now();
    while (countMatching(token) < 1 && Date.now() - t0 < 15000) await sleep(100);
    const holdB = spawnLogged(['--input-type=module', '-e', `${holder(500)}`], env(1));
    await sleep(1200);
    const bBlocked = countMatching(token) === 1;
    holdA.child.kill('SIGKILL');
    // the stand-in A spawned is orphaned by the kill; it is ours, so reap it
    t0 = Date.now();
    await Promise.race([holdB.done, sleep(15000)]);
    const bAfterKillMs = Date.now() - t0;
    spawnSync('pkill', ['-f', token]);
    out.killRelease = { bBlockedWhileAHeld: bBlocked, bExitCode: holdB.code, bFinishedMsAfterKill: bAfterKillMs };
    out.killOk = bBlocked && holdB.code === 0 && bAfterKillMs < 8000;

    /* (d) the preflight refuses to launch: simulated low disk, then low memory */
    const pf = [];
    for (const [label, extra] of [['disk 2.5 GB', { CAL_PREFLIGHT_FREE_GB: '2.5' }], ['memory 20 %', { CAL_PREFLIGHT_MEM_FREE_PCT: '20' }]]) {
      const r1 = spawnLogged([path.join(TOOLS, 'screenshot.mjs'), 'semaphore-preflight-probe', '--port', String(PORT)], env(2, extra), childCwd);
      const s1 = await sampleWhile([r1.done], () => chromeMains(profileRoot));
      pf.push({ harness: 'screenshot.mjs', label, code: r1.code, refusedLoudly: /preflight refused to launch Chrome/.test(r1.err + r1.out), chromeLaunched: s1.max });
      const r2 = spawnLogged([path.join(TOOLS, 'gates.mjs'), '--port', String(PORT), '--only', 'A1-boot-clean'], env(2, extra), childCwd);
      const s2 = await sampleWhile([r2.done], () => chromeMains(profileRoot));
      pf.push({ harness: 'gates.mjs', label, code: r2.code, refusedLoudly: /preflight refused to launch Chrome/.test(r2.err + r2.out), chromeLaunched: s2.max });
    }
    out.preflight = pf;
    out.preflightOk = pf.every((r) => r.code !== 0 && r.refusedLoudly && r.chromeLaunched === 0);
  } finally {
    spawnSync('pkill', ['-f', `cal-standin-${process.pid}`]);
    out.childRunsWroteTheirReportsIn = existsSync(path.join(childCwd, 'shots', 'gates')) ? readdirSync(path.join(childCwd, 'shots', 'gates')).filter((f) => /^report/.test(f)).length + ' report file(s) in the sandbox' : 'nothing';
    // the trace, read before the sandbox (and its log) goes
    const trace = readTrace(tracer.log);
    const sandboxReal = realpathSync(sandbox);
    const inTree = trace.filter((e) => e.real === tree || e.real.startsWith(tree + path.sep));
    const realRunPids = new Set(trace.filter((e) => e.real === path.join(sandboxReal, 'cwd', 'shots', 'gates', `report.p${PORT}.json`)).map((e) => e.pid));
    out.writeTrace = { calls: trace.length, pids: new Set(trace.map((e) => e.pid)).size, intoThisTree: inTree.length, firstIntoTree: inTree.slice(0, 5).map((e) => ({ pid: e.pid, op: e.op, path: rel(e.real) })),
      outsideSandboxAndTree: [...new Set(trace.filter((e) => !(e.real === tree || e.real.startsWith(tree + path.sep)) && !e.real.startsWith(sandboxReal + path.sep)).map((e) => e.real.replace(/[^/]+$/, '*')))].slice(0, 8),
      positiveControl: { realRunsThatWroteTheirReportInTheSandbox: realRunPids.size, realRuns: (out.realRuns?.runs || []).length } };
    out.tracerSees = realRunPids.size >= Math.max(1, (out.realRuns?.runs || []).filter((r) => r.code === 0).length);
    out.noChildWroteIntoTheTree = inTree.length === 0;
    rmSync(sandbox, { recursive: true, force: true });
    // ATTRIBUTION of any change to the tree's report files (reported; a child-made change is restored and FAILs)
    const realAbs = (f) => { try { return path.join(realpathSync(path.dirname(f)), path.basename(f)); } catch { return f; } };
    out.treeReportFiles = keep.unchanged().map(({ abs, ...x }) => ({ ...x, writtenByASemaphoreChild: inTree.some((e) => e.real === realAbs(abs)) }));
    const childMade = new Set(keep.files.filter((f) => inTree.some((e) => e.real === realAbs(f))));
    out.treeReportsUntouchedByChildren = out.noChildWroteIntoTheTree;
    const foreign = out.treeReportFiles.filter((x) => !x.unchanged && !x.writtenByASemaphoreChild);
    if (foreign.length) out.foreignWritesInWindow = foreign.map((x) => ({ file: x.file, writtenBy: x.nowWrittenBy, at: x.mtimeNow, note: 'another process\'s gates run in this tree (not a semaphore child: the trace has no write to it); left as written' }));
    if (childMade.size) out.treeReportsRestored = keep.restore(childMade);
  }
  const pass = out.realOk && out.standinOk && out.killOk && out.preflightOk && out.tracerSees && out.noChildWroteIntoTheTree;
  return { pass, detail: out };
}

/* ------------------------------------------------------------------------ */
/* THE RUN LEDGER — sealed carried runs and R29 verdicts, outside every tree  */
/* ------------------------------------------------------------------------ */
const { GATES: CARRIED } = await import('./gates.r5.carried.mjs');
const CARRIED_IDS = new Set(CARRIED.map((g) => g.id));
/** R48 (b): the W0b instruments, graded from sealed runs (tools/gates/gates-perf.w0b.mjs INSTRUMENT_ROWS) */
const INSTRUMENT_IDS = new Set(['A-alloc-rate', 'A-vram-ledger', 'A90-abs']);
const INSTRUMENT_SOURCES = ['gates/gates-perf.w0b.mjs', 'budgets.mjs', 'gates.r5.gates-perf.mjs'];

/**
 * Judge findings (Oct 16, fix round 2): a carried report kept in the lane tree could be STALE
 * (graded after src/ changed), CLOBBERED (A-chrome-semaphore's child runs and any later run of
 * the port rewrite report.p<P>.json and the per-id PNGs) or FORGED (FAIL rows flipped by hand,
 * verdicts with a self-declared judge port). So nothing A-carried-suite grades lives in a tree:
 *
 *   <CAL_GATE_LEDGER, default $TMPDIR/cal-gate-ledger>/
 *     ledger.jsonl               append-only, one entry per line: `<sha256>\t<prev sha256>\t<json>`,
 *                                sha256 = H(prev + json) over the raw text: an edited, deleted or
 *                                re-ordered line breaks the chain and the gate FAILs
 *     runs/<sealId>/report.json  the run's report, copied by the run itself as it exits
 *     runs/<sealId>/<id>.png     every visual frame that run filmed, copied with it (the frames of all
 *                                but the newest 4 runs per tree + port are pruned; reports never are)
 *
 * A SEAL is written by the harness process (the exit hook below, installed in every
 * `node tools/gates.mjs` of this tree, sealing a run that executed >= 80 % of the carried rows):
 * the report's sha256, each frame's sha256, the process window and load average, the git HEAD,
 * and the BUILD FINGERPRINT at the start and at the end of the run (size + mtime of every file
 * of src/, public/, index.html, vite.config.js, package.json, the harness and every file that
 * defines a carried row, shadowing lane files included). A VERDICT is written by the `--judge`
 * CLI and binds (sealId, gate id, frame sha256); the judge reads the ledger's copy of the frame.
 */
const LEDGER_DIR = path.resolve(process.env.CAL_GATE_LEDGER || path.join(os.tmpdir(), 'cal-gate-ledger'));
const LEDGER_FILE = path.join(LEDGER_DIR, 'ledger.jsonl');
const LEDGER_RUNS = path.join(LEDGER_DIR, 'runs');
const LEDGER_KEEP_RUNS = 4;          // carried runs that keep their FRAMES, per (tree, port); every report copy is kept
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/** The ledger must live outside every worktree of the repo (a lane can then not ship its own verdicts in a merge). */
function ledgerOutsideTrees() {
  const realOf = (p) => { let cur = p; const rest = []; while (!existsSync(cur) && path.dirname(cur) !== cur) { rest.unshift(path.basename(cur)); cur = path.dirname(cur); } return path.join(realpathSync(cur), ...rest); };
  const led = realOf(LEDGER_DIR);
  const wt = spawnSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const trees = (wt.stdout || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => { try { return realpathSync(l.slice(9)); } catch { return null; } }).filter(Boolean);
  const inside = trees.filter((t) => led === t || led.startsWith(t + path.sep));
  return { ok: inside.length === 0, ledger: led, insideTree: inside[0] || null };
}
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function withLedgerLock(fn) {
  mkdirSync(LEDGER_DIR, { recursive: true });
  const lock = path.join(LEDGER_DIR, 'ledger.lock');
  const t0 = Date.now();
  for (;;) {
    try { mkdirSync(lock); break; } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try { if (Date.now() - statSync(lock).mtimeMs > 30000) rmSync(lock, { recursive: true, force: true }); } catch { /* raced */ }
      if (Date.now() - t0 > 60000) throw new Error('ledger lock held for more than 60 s: ' + lock);
      sleepSync(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

/** Every ledger entry, chain-verified: { ok, entries: [{ hash, entry }], head, brokenAt?, why? } */
function readLedger() {
  if (!existsSync(LEDGER_FILE)) return { ok: true, entries: [], head: 'genesis', file: LEDGER_FILE };
  const lines = read(LEDGER_FILE).split('\n').filter(Boolean);
  const entries = [];
  let prev = 'genesis';
  for (let i = 0; i < lines.length; i++) {
    const [h, p, ...rest] = lines[i].split('\t');
    const json = rest.join('\t');
    if (p !== prev) return { ok: false, entries, head: prev, brokenAt: i + 1, why: 'its prev hash does not chain to the line before', file: LEDGER_FILE };
    if (h !== sha256(p + json)) return { ok: false, entries, head: prev, brokenAt: i + 1, why: 'its hash does not match its text (edited)', file: LEDGER_FILE };
    let entry;
    try { entry = JSON.parse(json); } catch { return { ok: false, entries, head: prev, brokenAt: i + 1, why: 'unparseable', file: LEDGER_FILE }; }
    entries.push({ hash: h, entry });
    prev = h;
  }
  return { ok: true, entries, head: prev, file: LEDGER_FILE };
}

function appendLedger(entry) {
  return withLedgerLock(() => {
    const L = readLedger();
    if (!L.ok) throw new Error(`ledger ${LEDGER_FILE} is broken at line ${L.brokenAt} (${L.why}); refusing to append`);
    const json = JSON.stringify({ seq: L.entries.length + 1, ...entry });
    const h = sha256(L.head + json);
    appendFileSync(LEDGER_FILE, `${h}\t${L.head}\t${json}\n`);
    return h;
  });
}

/** The files a carried run's verdict depends on: the build, the harness, and what defines the carried rows. */
const BUILD_TOOLS = ['gates.r5.carried.mjs', 'gate-roster.mjs', 'gate-places.mjs', 'budgets.mjs', 'gate-speeds.mjs',
  'gates.mjs', 'gate-verdict.mjs', 'chrome-profile.mjs', 'gates.config.mjs'];
function buildFingerprint(shadowFiles = []) {
  const files = [];
  const walk = (dir) => {
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else files.push(p); }
  };
  walk(path.join(ROOT, 'src'));
  walk(path.join(ROOT, 'public'));
  for (const f of ['index.html', 'vite.config.js', 'package.json']) files.push(path.join(ROOT, f));
  for (const f of new Set([...BUILD_TOOLS, ...shadowFiles])) files.push(path.join(TOOLS, f));
  const rows = [];
  let newest = { file: null, mtimeMs: 0 };
  for (const p of files.sort()) {
    let st;
    try { st = lstatSync(p); } catch { rows.push(rel(p) + '|missing'); continue; }
    rows.push(`${rel(p)}|${st.size}|${Math.round(st.mtimeMs)}`);
    if (st.mtimeMs > newest.mtimeMs) newest = { file: rel(p), mtimeMs: st.mtimeMs };
  }
  return { digest: sha256(rows.join('\n')), files: rows.length, newest: { file: newest.file, mtime: new Date(newest.mtimeMs).toISOString() } };
}
const gitHead = () => { const r = spawnSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const shadowFilesOf = (cfg) => [...new Set((cfg?.SHADOWED || []).map((s) => s.by))].sort();

/* ---- the seal hook, run monitor and frame capture: installed in `node tools/gates.mjs` of THIS tree, never elsewhere ---- */
const IS_GATES_RUN = (() => {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(path.join(TOOLS, 'gates.mjs')); } catch { return false; }
})();
const argFlag = (k, dflt) => { const a = process.argv.slice(2); const i = a.indexOf(k); return i >= 0 ? a[i + 1] : dflt; };
const isoOf = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

function pruneRuns(tree, port) {
  const L = readLedger();
  const mine = L.entries.map((e) => e.entry).filter((e) => e.kind === 'seal' && e.tree === tree && Number(e.port) === Number(port)).reverse();
  // frames of the newest LEDGER_KEEP_RUNS full runs and of the newest LEDGER_KEEP_RUNS partial re-runs are kept
  const old = [...mine.filter((e) => !e.partial).slice(LEDGER_KEEP_RUNS), ...mine.filter((e) => e.partial).slice(LEDGER_KEEP_RUNS)];
  for (const s of old) {
    const dir = path.join(LEDGER_RUNS, s.sealId);
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.png')); } catch { files = []; }
    for (const f of files) rmSync(path.join(dir, f), { force: true });
  }
}

/**
 * FIX ROUND 3 (judge findings, Oct 16).
 *
 * (1) FRAMES ARE BOUND AT CAPTURE. The harness writes every frame to the shared
 *     `shots/gates/<id>.png` (any port, any run in this tree), and the round-2 seal hashed that
 *     path at exit, ~66 min later, accepting any file newer than the run's start: a second run in
 *     the same tree could replace a frame in between. Now `Page.prototype.screenshot` is wrapped
 *     in this process (an observer: the harness still writes the same file): the bytes the call
 *     RETURNS — exactly what it wrote — are hashed and copied, at that instant, to a staging dir
 *     of this process in the ledger (`<ledger>/staging/<pid>-<ms>/<id>.png`) for every carried
 *     visual row. The seal takes the frame from there, checks its hash against the capture
 *     record, and never reads `shots/gates/` at all. The report is captured the same way: the
 *     payload this process passes to writeFileSync('shots/gates/report.p<PORT>.json'), not the
 *     file as found at exit.
 * (2) THE RUN WATCHES ITSELF. A-port-guard's lsof half graded an external `--watch-5173` log on
 *     freshness alone (a log 5.4 h older than the invocation passed). Every gate run of this tree
 *     on an allowed port now samples, every 2 s and in-process: `lsof` for client connections to
 *     :5173 from this run's own process tree (the runner, its Vite, its Chrome and every helper),
 *     main's dependency-cache `_metadata.json`, the box (1-min load, other gate Chromes), and any
 *     OTHER `tools/gates.mjs` whose cwd is this tree. A sealed run carries that log (sha256 in the
 *     seal); A-port-guard grades the live log of its own invocation plus the log of every sealed
 *     carried run it vouches for, each required to cover its whole window with no gap > 10 s.
 *     A child `gates.mjs` of a monitored run (A-chrome-semaphore's) is covered by its parent's.
 */
const portAllowed = (raw) => { const p = Number(raw); return /^\d+$/.test(String(raw ?? '')) && p >= 5250 && p <= 5299 && !(p >= 5272 && p <= 5279); };
const RUN_PORT_RAW = argFlag('--port', process.env.SHOT_PORT);
const RUN_ACTIVE = IS_GATES_RUN && portAllowed(RUN_PORT_RAW);     // a refused port installs nothing (the guard exits first)
const RUN_PORT = RUN_ACTIVE ? Number(RUN_PORT_RAW) : null;
const PROCESS_START_MS = Date.now() - Math.round(process.uptime() * 1000);
const RUN_ID = RUN_ACTIVE ? `p${RUN_PORT}-${process.pid}-${PROCESS_START_MS}` : null;   // the run id: in the report, the seal and every sealed frame's path
if (RUN_ID && !process.env.CAL_RUN_ID) process.env.CAL_RUN_ID = RUN_ID;   // W0b fix round 3: the R48 (b) instrument rows quote it (children inherit the parent's, never seal it)
const CARRIED_VISUAL = new Set(CARRIED.filter((g) => g.kind === 'visual').map((g) => g.id));
const MONITOR_EVERY_MS = 2000, MONITOR_MAX_GAP_MS = 10000, SEAL_VERSION = 3;
const LEDGER_STAGING = path.join(LEDGER_DIR, 'staging');
const pidAliveP = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** main repo's Vite dependency-cache metadata (Kevin's 5173 server reads it) */
// resolved lazily: a module-level spawn would be a child process of every harness that loads the registry,
// including the ones A-port-guard requires to refuse before touching any socket or child
let MAIN_META;
const mainMetaFile = () => {
  if (MAIN_META !== undefined) return MAIN_META;
  const g = spawnSync('git', ['-C', ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  return (MAIN_META = g.status === 0 ? path.join(path.dirname(g.stdout.trim()), 'node_modules', '.vite', 'deps', '_metadata.json') : null);
};
function readMainMeta() {
  const f = mainMetaFile();
  try { const st = statSync(f); const j = JSON.parse(read(f)); return { mtime: new Date(st.mtimeMs).toISOString(), configHash: j.configHash, hash: j.hash, browserHash: j.browserHash }; } catch { return null; }
}

/*
 * The monitor runs in a WORKER THREAD: the gates of this lane block the main thread for seconds at a
 * time (spawnSync children in A-gates-autodiscover, A-port-guard's refusal runs, the Vite config
 * probe), and a sampler on the main event loop goes blind exactly then, while the run's children keep
 * running. The worker has its own event loop, samples every 2 s whatever the main thread is doing, and
 * rewrites its state file (atomic rename) after every sample; the main thread only reads that file.
 */
const MONITOR_SRC = String.raw`
const { workerData: W } = require('worker_threads');
const { execFile } = require('child_process');
const fs = require('fs'), os = require('os');
const M = W.init;
const PORT = W.watchPort || 5173, CLIENT_END = new RegExp('->[^ ]*:' + PORT + '$');
const iso = (ms) => new Date(ms).toISOString();
const run = (cmd, args) => new Promise((res) => execFile(cmd, args, { encoding: 'utf8', timeout: 8000, maxBuffer: 32 * 1024 * 1024 },
  (err, stdout) => res({ ok: !err || (err.code === 1 && !err.killed), stdout: stdout || '' })));   // lsof exits 1 on no match
const isGateCmd = (c) => /Chrome for Testing|chrome-headless|gates\.mjs|screenshot\.mjs|gates\.r5\.|chrome-profile/.test(c)
  || (/vite/.test(c) && /--strictPort/.test(c) && !/--port 5173\b/.test(c));
const meta = () => { try { const st = fs.statSync(W.mainMeta); const j = JSON.parse(fs.readFileSync(W.mainMeta, 'utf8'));
  return { mtime: iso(st.mtimeMs), configHash: j.configHash, hash: j.hash, browserHash: j.browserHash }; } catch { return null; } };
function absorb(lsofOut, psOut, at) {
  const rows = [];
  for (const l of psOut.split('\n')) { const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l); if (m) rows.push({ pid: +m[1], ppid: +m[2], cmd: m[3] }); }
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r.pid); }
  const mine = new Set([W.rootPid]);
  for (const q = [W.rootPid]; q.length;) for (const c of kids.get(q.pop()) || []) if (!mine.has(c)) { mine.add(c); q.push(c); }
  const cmdOf = new Map(rows.map((r) => [r.pid, r.cmd]));
  if (M.childrenAtFirstSample == null) {
    const k = [...mine].filter((x) => x !== W.rootPid && !/^(\/usr\/sbin\/)?lsof\b|^(\/bin\/)?ps\b/.test(cmdOf.get(x) || ''));
    M.childrenAtFirstSample = k.length;
    M.childrenAtFirstSampleCmds = k.slice(0, 4).map((x) => (cmdOf.get(x) || '?').slice(0, 100));
  }
  let pid = null;
  for (const line of lsofOut.split('\n')) {
    if (line[0] === 'p') pid = +line.slice(1);
    else if (line[0] === 'n' && pid && CLIENT_END.test(line)) {                  // this process is the CLIENT end
      if (mine.has(pid)) {
        M.gateConnectionCount++;
        if (M.gateConnections.length < 50) M.gateConnections.push({ at: iso(at), pid, cmd: (cmdOf.get(pid) || '').slice(0, 160), conn: line.slice(1) });
      } else if (isGateCmd(cmdOf.get(pid) || '')) M.otherGateProcessConnections++;   // another run's: reported, not ours
    }
  }
  const load1 = +os.loadavg()[0].toFixed(2);
  const other = rows.filter((r) => /Chrome for Testing|chrome-headless-shell/.test(r.cmd) && !/--type=/.test(r.cmd) && /--remote-debugging/.test(r.cmd) && !mine.has(r.pid)).length;
  M.box.loadMax = Math.max(M.box.loadMax, load1);
  M.box.otherGateChromesMax = Math.max(M.box.otherGateChromesMax, other);
  if (load1 < 3 && other === 0) M.box.quietSamples++;
  const mm = meta(), lm = M.mainViteCache.last;
  if (!M.mainViteCache.atStart) M.mainViteCache.atStart = mm;
  else if (mm && (!lm || mm.mtime !== lm.mtime || mm.hash !== lm.hash)) M.mainViteCache.changes.push({ at: iso(at), ...mm });
  if (mm) M.mainViteCache.last = mm;
  return rows.filter((r) => !mine.has(r.pid) && /(^|\/|\s)tools\/gates\.mjs(\s|$)/.test(r.cmd) && /\bnode\b/.test(r.cmd));
}
function absorbCwds(others, out, at) {
  let pid = null;
  for (const line of out.split('\n')) {
    if (line[0] === 'p') pid = +line.slice(1);
    else if (line[0] === 'n' && pid) {
      let cwd = line.slice(1);
      try { cwd = fs.realpathSync(cwd); } catch { /* gone */ }
      if (cwd !== M.tree) continue;
      const o = others.find((r) => r.pid === pid);
      const rec = M.sameTreeRuns[pid] || (M.sameTreeRuns[pid] = { pid, cmd: (o ? o.cmd : '').slice(0, 200), firstSeen: iso(at), samples: 0 });
      rec.lastSeen = iso(at); rec.samples++;
    }
  }
}
const write = () => {
  M.startedAt = M.startedAtMs != null ? iso(M.startedAtMs) : null; M.lastAt = M.lastAtMs != null ? iso(M.lastAtMs) : null;
  try { fs.writeFileSync(W.out + '.tmp', JSON.stringify(M)); fs.renameSync(W.out + '.tmp', W.out); } catch { M.writeErrors = (M.writeErrors || 0) + 1; }
};
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const [l, p] = await Promise.all([run('lsof', ['-nP', '-iTCP:' + PORT, '-sTCP:ESTABLISHED', '-F', 'pcn']), run('ps', ['-axww', '-o', 'pid=,ppid=,command='])]);
    const at = Date.now();
    if (!l.ok || !p.ok) { M.errors++; return; }                     // a failed sample is a GAP, never a clean one
    const others = absorb(l.stdout, p.stdout, at);
    if (others.length) absorbCwds(others, (await run('lsof', ['-a', '-d', 'cwd', '-p', others.map((o) => o.pid).join(','), '-Fn'])).stdout, at);
    if (M.lastAtMs != null) M.maxGapMs = Math.max(M.maxGapMs, at - M.lastAtMs);
    if (M.startedAtMs == null) M.startedAtMs = at;
    M.lastAtMs = at; M.samples++;
  } catch { M.errors++; } finally { busy = false; write(); }
}
tick();
setInterval(tick, W.everyMs);
`;
const MON_FILE = RUN_ACTIVE ? path.join(LEDGER_STAGING, `monitor-${process.pid}-${PROCESS_START_MS}.json`) : null;
let monCoveredBy = null, monWorker = null;
/** the monitor's latest state (the worker's file), or { coveredByAncestor } for a child run of a monitored run */
function readMonitor() {
  if (monCoveredBy) return { coveredByAncestor: monCoveredBy };
  if (!MON_FILE) return null;
  try { return JSON.parse(readFileSync(MON_FILE, 'utf8')); } catch { return null; }
}
/** wait (async) for a sample taken at or after `t` (A-port-guard grades a window that ends now) */
async function freshMonitor(t, maxMs = 8000) {
  const t0 = Date.now();
  let m = readMonitor();
  while (!(m && (m.coveredByAncestor || m.lastAtMs >= t)) && Date.now() - t0 < maxMs) { await sleep(250); m = readMonitor(); }
  return m;
}
function startMonitor() {
  mkdirSync(LEDGER_STAGING, { recursive: true });
  const init = { version: 2, sampler: 'worker_thread', pid: process.pid, tree: realpathSync(ROOT), port: RUN_PORT, argv: process.argv.slice(2),
    processStartedAtMs: PROCESS_START_MS, processStartedAt: isoOf(PROCESS_START_MS), startedAtMs: null, lastAtMs: null, everyMs: MONITOR_EVERY_MS,
    samples: 0, errors: 0, maxGapMs: 0, gateConnectionCount: 0, gateConnections: [], otherGateProcessConnections: 0,
    mainViteCache: { file: mainMetaFile(), atStart: null, last: null, changes: [] },
    box: { loadMax: 0, otherGateChromesMax: 0, quietSamples: 0 }, sameTreeRuns: {}, childrenAtFirstSample: null };
  monWorker = new Worker(MONITOR_SRC, { eval: true, workerData: { out: MON_FILE, everyMs: MONITOR_EVERY_MS, rootPid: process.pid,
    tree: init.tree, mainMeta: init.mainViteCache.file, init } });
  monWorker.unref();
  monWorker.on('error', (e) => { try { writeSync(2, `[monitor] worker failed: ${e.message}\n`); } catch { /* */ } });
}
/**
 * POSITIVE CONTROL for the lsof half: the same worker, pointed at a scratch listener this process opens
 * on 127.0.0.1 (never 5173), must see the connection this process makes to it. A monitor that reports
 * 0 connections to :5173 is only evidence if it is shown to see a connection when there is one.
 */
async function lsofPositiveControl() {
  const srv = net.createServer((sk) => sk.on('error', () => {}));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  mkdirSync(LEDGER_STAGING, { recursive: true });
  const out = path.join(LEDGER_STAGING, `monitor-${process.pid}-ctl${Date.now()}.json`);
  const init = { version: 2, sampler: 'worker_thread', control: true, watchPort: port, startedAtMs: null, lastAtMs: null, samples: 0, errors: 0, maxGapMs: 0,
    gateConnectionCount: 0, gateConnections: [], otherGateProcessConnections: 0, mainViteCache: { file: null, atStart: null, last: null, changes: [] },
    box: { loadMax: 0, otherGateChromesMax: 0, quietSamples: 0 }, sameTreeRuns: {}, childrenAtFirstSample: null, tree: realpathSync(ROOT) };
  const w = new Worker(MONITOR_SRC, { eval: true, workerData: { out, everyMs: 400, rootPid: process.pid, tree: init.tree, mainMeta: null, init, watchPort: port } });
  const sock = net.connect(port, '127.0.0.1');
  sock.on('error', () => {});
  await new Promise((r) => sock.once('connect', r));
  let m = null;
  for (const t0 = Date.now(); Date.now() - t0 < 10000; await sleep(300)) { try { m = JSON.parse(read(out)); } catch { m = null; } if (m && m.samples >= 3) break; }
  sock.destroy(); srv.close();
  await w.terminate();
  rmSync(out, { force: true }); rmSync(out + '.tmp', { force: true });
  return { port, samples: m?.samples ?? 0, connectionsSeen: m?.gateConnectionCount ?? 0, sample: (m?.gateConnections || [])[0] || null, ok: (m?.gateConnectionCount ?? 0) > 0 };
}
const monSummary = (m) => (!m ? 'no monitor' : m.coveredByAncestor ? 'covered by parent run ' + m.coveredByAncestor
  : `${m.samples} samples, max gap ${m.maxGapMs} ms, ${m.gateConnectionCount} gate connection(s) to :5173, children at first sample ${m.childrenAtFirstSample} ${JSON.stringify(m.childrenAtFirstSampleCmds || [])}`);

/* frame + report capture */
const CAP = { dir: null, frames: {}, report: null, errors: [] };
const SHOTS_DIR = path.resolve('shots', 'gates');
function captureFrame(opts, out) {
  const p = opts && typeof opts.path === 'string' ? path.resolve(opts.path) : null;
  if (!p || path.dirname(p) !== SHOTS_DIR || !out || typeof out === 'string') return;
  const id = path.basename(p).replace(/\.png$/, '');
  if (!CARRIED_VISUAL.has(id)) return;                                // only frames an R29 judge grades are kept
  const buf = Buffer.from(out);                                      // a copy of exactly the bytes the call wrote
  if (!CAP.dir) { CAP.dir = path.join(LEDGER_STAGING, `${process.pid}-${PROCESS_START_MS}`); mkdirSync(CAP.dir, { recursive: true }); }
  const file = path.join(CAP.dir, id + '.png');
  writeFileSync(file, buf);
  CAP.frames[id] = { at: Date.now(), sha256: sha256(buf), bytes: buf.length, file, n: (CAP.frames[id]?.n || 0) + 1 };
}
if (RUN_ACTIVE) {
  const where = ledgerOutsideTrees();
  if (where.ok) {
    // stale staging dirs of runs that died before sealing
    try { for (const d of readdirSync(LEDGER_STAGING)) { const pid = Number(d.replace(/^monitor-/, '').split('-')[0]); if (pid && !pidAliveP(pid)) rmSync(path.join(LEDGER_STAGING, d), { recursive: true, force: true }); } } catch { /* none */ }
    const { Page } = await import('puppeteer');
    if (Page?.prototype?.screenshot && !Page.prototype.screenshot.__calCapture) {
      const real = Page.prototype.screenshot;
      const wrapped = async function (...a) {
        const out = await real.apply(this, a);
        try { captureFrame(a[0], out); } catch (e) { if (CAP.errors.length < 10) CAP.errors.push(String(e?.message || e).slice(0, 160)); }
        return out;
      };
      wrapped.__calCapture = true;
      Page.prototype.screenshot = wrapped;
    }
    const reportPath = path.resolve('shots', 'gates', `report.p${RUN_PORT}.json`);
    const reportPaths = new Set([reportPath, path.resolve('shots', 'gates', 'report.json')]);
    const realWrite = fsMod.writeFileSync;
    if (!realWrite.__calCapture) {
      const w = function (file, data, ...rest) {
        // R33 (d): the run id goes INTO the report (the harness payload + one `runId` field), and the
        // bytes captured are exactly the bytes written
        let out = data;
        try {
          if (typeof file === 'string' && reportPaths.has(path.resolve(file)) && typeof data === 'string') {
            const j = JSON.parse(data);
            if (j && typeof j === 'object' && !j.runId) out = JSON.stringify({ ...j, runId: RUN_ID }, null, 2);
          }
        } catch { out = data; }
        const r = realWrite.call(this, file, out, ...rest);
        try { if (typeof file === 'string' && path.resolve(file) === reportPath) CAP.report = { at: Date.now(), buf: Buffer.from(out) }; } catch { /* observer only */ }
        return r;
      };
      w.__calCapture = true;
      fsMod.writeFileSync = w;
      syncBuiltinESMExports();   // gates.mjs imports { writeFileSync } from 'fs': its binding now reaches the observer
    }
  }
}

function sealRun(startedAtMs, atStart, cfg, loadStart, sealer) {
  const where = ledgerOutsideTrees();
  if (!where.ok) { writeSync(2, `[ledger] NOT SEALED: the ledger ${where.ledger} lies inside the worktree ${where.insideTree}\n`); return; }
  const port = RUN_PORT;
  if (!CAP.report) return;                                           // this process wrote no report of its own
  const buf = CAP.report.buf;
  let rep;
  try { rep = JSON.parse(buf); } catch { return; }
  if (Number(rep.port) !== port) return;
  const results = rep.results || [];
  const carried = results.filter((r) => CARRIED_IDS.has(r.id)).length;
  // W0b: the full suite runs once per round (orchestrator), so a TARGETED re-run — `--only` of carried ids and
  // nothing else — is sealed too, as a PARTIAL run: one more observation of exactly the rows it ran (how a
  // known-flaky row gets its first-5 window, R33 b). Anything else under 80 % of the carried rows is not sealed.
  const partial = carried < 0.8 * CARRIED_IDS.size;
  const targeted = partial && carried > 0 && carried === results.length && argFlag('--only', null) != null;
  // W0b fix round 3 (R48 b: the W0b instruments are graded from SEALED runs): any run that executed one of the
  // instrument rows is sealed too, whatever else it ran (the lane block, a targeted --only, a suite), as one more
  // observation of exactly the rows it ran; `instrumentRows` names them, `carriedRows` says whether it also observed
  // carried rows (A-carried-suite reads only seals with carried rows)
  const instrumentRows = results.filter((r) => INSTRUMENT_IDS.has(r.id)).map((r) => r.id);
  if (partial && !targeted && !instrumentRows.length) {              // only carried and instrument runs are sealed; say what was observed
    if (carried) writeSync(1, `[ledger] not sealed (${carried} of ${CARRIED_IDS.size} carried rows < 80 %): report captured at ${isoOf(CAP.report.at)}, `
      + `${Object.keys(CAP.frames).length} carried frame(s) capture-bound (${Object.entries(CAP.frames).map(([k, v]) => k + ' ' + v.sha256.slice(0, 12)).join(', ') || 'none'}), `
      + `monitor: ${monSummary(readMonitor())}\n`);
    return;
  }
  const shadows = shadowFilesOf(cfg);
  const atEnd = buildFingerprint(shadows);
  // R33 (d): the seal id IS the run id, so it is in every sealed frame's path (runs/<runId>/<id>.png) and in the report
  const sealId = RUN_ID;
  if (rep.runId !== RUN_ID) { writeSync(2, `[ledger] NOT SEALED: the captured report carries runId ${rep.runId}, not ${RUN_ID}\n`); return; }
  const dir = path.join(LEDGER_RUNS, sealId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'report.json'), buf);
  const frames = {}, framesCapture = {}, framesNotFilmed = [];
  for (const r of results) {
    if (r.status !== 'NEEDS-JUDGE' || !CARRIED_IDS.has(r.id)) continue;
    const cap = CAP.frames[r.id];
    let b = null;
    try { b = cap ? readFileSync(cap.file) : null; } catch { b = null; }
    // no capture by this process, or the staging copy no longer hashes to the capture: not filmed by this run
    if (!b || sha256(b) !== cap.sha256) { framesNotFilmed.push(r.id); continue; }
    writeFileSync(path.join(dir, r.id + '.png'), b);
    frames[r.id] = cap.sha256;
    framesCapture[r.id] = { at: isoOf(cap.at), captures: cap.n, bytes: cap.bytes };
  }
  const MON = readMonitor() || { samples: 0, maxGapMs: null, errors: null, gateConnectionCount: null, mainViteCache: { changes: [] }, box: null, sameTreeRuns: {} };
  const monBuf = Buffer.from(JSON.stringify(MON));
  writeFileSync(path.join(dir, 'monitor.json'), monBuf);
  const endedAt = new Date().toISOString();
  // the instrument rows' own source is bound to the seal too (it is not part of the carried build fingerprint)
  const instrumentSource = instrumentRows.length ? INSTRUMENT_SOURCES.map((f) => ({ file: 'tools/' + f, sha256: (() => { try { return sha256(readFileSync(path.join(TOOLS, f))); } catch { return null; } })() })) : undefined;
  appendLedger({ kind: 'seal', sealVersion: SEAL_VERSION, sealId, partial, instrumentRows, instrumentSource, scope: instrumentRows.length ? (carried ? 'carried+instruments' : 'instruments') : 'carried',
    runId: runStarted ? RUN_ID : null, at: endedAt, tree: realpathSync(ROOT), port, pid: process.pid,
    argv: process.argv.slice(2), startedAt: isoOf(startedAtMs), endedAt,
    load: { start: loadStart, end: os.loadavg().map((x) => +x.toFixed(2)) },
    reportStamp: rep.stamp, reportSha256: sha256(buf), reportCapturedAt: isoOf(CAP.report.at), results: results.length, carriedRows: carried,
    gitHead: gitHead(), shadowFiles: shadows, build: { atStart, atEnd }, sealer,
    frames, framesCapture, framesNotFilmed, captureErrors: CAP.errors,
    monitorSha256: sha256(monBuf),
    monitor: { startedAt: isoOf(MON.startedAtMs), lastAt: isoOf(MON.lastAtMs), samples: MON.samples, maxGapMs: MON.maxGapMs, errors: MON.errors,
      gateConnections: MON.gateConnectionCount, mainCacheRewrites: (MON.mainViteCache?.changes || []).length, box: MON.box, coveredByAncestor: MON.coveredByAncestor || null },
    concurrentSameTreeRuns: Object.values(MON.sameTreeRuns || {}) });
  pruneRuns(realpathSync(ROOT), port);
  writeSync(1, `[ledger] sealed ${partial ? 'PARTIAL (' + carried + ' carried row(s)' + (instrumentRows.length ? ', instrument rows ' + instrumentRows.join(' ') : '') + ')' : 'FULL'} run ${sealId}: report + ${Object.keys(frames).length} capture-bound frames + run monitor (${MON.samples} samples) copied to ${dir}; seal appended to ${LEDGER_FILE}\n`);
}

let runStarted = false;
if (RUN_ACTIVE && !globalThis.__CAL_SEAL_HOOK__) {
  globalThis.__CAL_SEAL_HOOK__ = true;
  const startedAtMs = Date.now();
  const loadStart = os.loadavg().map((x) => +x.toFixed(2));
  let sealer = null;
  try { sealer = { file: rel(fileURLToPath(import.meta.url)), sha256: sha256(readFileSync(fileURLToPath(import.meta.url))) }; } catch { sealer = null; }
  let cfg = null, atStart = null;
  // not awaited: gates.config.mjs is still importing this file; the promise settles as soon as the
  // registry has finished loading, which is before gates.mjs runs its first gate
  import('./gates.config.mjs').then((m) => {
    cfg = m; atStart = buildFingerprint(shadowFilesOf(m));
    // fix round 3: a carried run announces itself when it STARTS, so a run that is aborted or crashes
    // before its seal still leaves a trace that A-carried-suite reports (it can no longer vanish)
    try {
      const sel = carriedRowsThisInvocation(m.GATES);
      const all = selectedThisInvocation(m.GATES);
      const targeted = sel.length > 0 && sel.length === all.length && argFlag('--only', null) != null;
      // a child gates.mjs of a monitored run (A-chrome-semaphore's harness exercises) is never an observation
      const instr = all.filter((id) => INSTRUMENT_IDS.has(id));
      if (!monCoveredBy && (sel.length >= 0.8 * CARRIED_IDS.size || targeted || instr.length) && ledgerOutsideTrees().ok) {
        appendLedger({ kind: 'run-start', runId: RUN_ID, at: isoOf(startedAtMs), tree: realpathSync(ROOT), port: RUN_PORT, pid: process.pid,
          argv: process.argv.slice(2), carriedRowsSelected: sel.length, instrumentRowsSelected: instr, partial: sel.length < 0.8 * CARRIED_IDS.size, build: atStart.digest, gitHead: gitHead() });
        runStarted = true;
      }
    } catch (e) { try { writeSync(2, `[ledger] run-start not recorded: ${e.message}\n`); } catch { /* */ } }
  }).catch(() => { atStart = buildFingerprint([]); });
  // a child gates.mjs of a monitored run (A-chrome-semaphore's) is inside its parent's process tree
  if (Number(process.env.CAL_GATE_MONITOR_PID) === process.ppid && pidAliveP(process.ppid)) monCoveredBy = process.ppid;
  else {
    process.env.CAL_GATE_MONITOR_PID = String(process.pid);
    try { startMonitor(); } catch (e) { writeSync(2, `[monitor] not started: ${e.message}\n`); }
  }
  process.on('exit', () => {
    // a child gates.mjs of a monitored run (A-chrome-semaphore's four A1 runs and its preflight refusals) exercises
    // the harness; it is never sealed as an observation of the build (its monitor is its parent's)
    try { if (atStart && !monCoveredBy) sealRun(startedAtMs, atStart, cfg, loadStart, sealer); } catch (e) { try { writeSync(2, `[ledger] SEAL FAILED: ${e.message}\n`); } catch { /* */ } }
    try { if (CAP.dir) rmSync(CAP.dir, { recursive: true, force: true }); } catch { /* */ }
    try { if (MON_FILE) { rmSync(MON_FILE, { force: true }); rmSync(MON_FILE + '.tmp', { force: true }); } } catch { /* */ }
  });
}

/* ------------------------------------------------------------------------ */
/* A-carried-suite                                                           */
/* ------------------------------------------------------------------------ */
function carriedComposition() {
  const app = appendixB();
  const want = app.filter((r) => r.verdict === 'CARRY' || r.verdict === 'RESTAGE');
  const dies = app.filter((r) => r.verdict === 'DIES').map((r) => r.id);
  const carriedIds = CARRIED.map((g) => g.id);
  const count = new Map();
  for (const id of carriedIds) count.set(id, (count.get(id) || 0) + 1);
  const toCarried = (aid) => { for (const [cid, re] of Object.entries(RENAMED)) if (re.test(aid)) return cid; return aid; };
  const missing = want.filter((r) => !count.has(toCarried(r.id))).map((r) => r.id);
  const dupes = [...count].filter(([, n]) => n > 1).map(([id]) => id);
  const known = new Set(want.map((r) => toCarried(r.id)));
  const extra = carriedIds.filter((id) => !known.has(id));
  const diesPresent = dies.filter((id) => count.has(id));
  return { appendixCarryRestage: want.length, carriedRows: carriedIds.length, missing, dupes, extra, diesPresent,
    renamed: Object.keys(RENAMED), ok: missing.length === 0 && dupes.length === 0 && extra.length === 0 && diesPresent.length === 0 };
}

/* R29 judge ports: the plan's visual judge (5271) and the Oct-15 lane judges (lane port + 30). */
const JUDGE_PORT_OK = (p) => p === 5271 || (p >= 5280 && p <= 5299);

/**
 * How each carried row ENDED in one run. A PENDING is never a pass: it is a named SKIP
 * (R18 / R28 / R30 label in its detail), a Round-4-attributed PENDING (the box could not be
 * measured: contention, starved windows), or anything else, an unattributed PENDING, which fails.
 */
const ATTRIBUTION = /not attributable|NOT ATTRIBUTABLE|too wedged|wedged|contended|quiet (box|machine)|clean stance windows|starved|PENDING: draw calls inside budget|box is too|GPU instability|burst instability/i;
const skipClassOf = (text) => /SKIP-legacy-deleted/.test(text) ? 'skipR30' : /SKIP-legacy \(R28\)/.test(text) ? 'skipR28' : /SKIP-R18/.test(text) ? 'skipR18' : null;
const BAD_ACTION = ['override', 'unrun', 'fail', 'pendingUnattributed', 'stagingFlaky'];
const BAD_VISUAL = ['awaitingJudge', 'judgeInvalid', 'judgeUnanchored', 'shotInvalid', 'fail', 'stagingFlaky'];

/** The SKIP card (gate-roster SKIP_CARD: a full-frame #101418 panel): all four corners read (16, 20, 24). */
async function cardCorners(file) {
  const { default: sharp } = await import('sharp');
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const at = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  return [[4, 4], [info.width - 5, 4], [4, info.height - 5], [info.width - 5, info.height - 5]].map(([x, y]) => at(x, y));
}
const cornersAre = (corners, rgb) => corners.every((c) => Math.abs(c[0] - rgb[0]) <= 3 && Math.abs(c[1] - rgb[1]) <= 3 && Math.abs(c[2] - rgb[2]) <= 3);
async function isSkipCard(file) { return cornersAre(await cardCorners(file), [16, 20, 24]); }
/** W0b fix round 1: the STAGING FAILED card (gate-roster FAIL_CARD, #3a0d12): a row's own staging assertion failed -> FAIL */
async function isFailCard(file) { return cornersAre(await cardCorners(file), [58, 13, 18]); }

/**
 * FIX ROUND 3 (judge finding: "R29 verdicts accept any self-declared judge port, so the lane itself
 * can turn visual rows green"). A port number is something any process can type. A verdict now
 * counts only when it is SIGNED by a judge key that the ORCHESTRATOR registered:
 *
 *   orchestrator, once:  --judge-keygen --out <outside every tree>/orchestrator.pem   (prints its public key)
 *   orchestrator, per judge: --judge-register --judge-name <who> --port <judge port>
 *                            --judge-pub <the judge's public key> --orchestrator-key <orchestrator.pem>
 *                        -> ledger entry { kind: 'judge-registered', judge, port, judgePub, orchestratorPub, sig }
 *   judge:               --judge-keygen --out <its scratch>/judge.pem, then every verdict with
 *                        --judge-key <judge.pem>  -> { ..., judgePub, sig } over (seal, row, frame sha256,
 *                        pass, judge, port, sha256(rationale), reference, at)
 *   grader:              CAL_ORCHESTRATOR_PUBKEY=<base64 SPKI>[,…] (or CAL_ORCHESTRATOR_PUBKEY_FILE): the
 *                        orchestrator keys it trusts. A verdict counts only if its signature verifies,
 *                        a registration of that key for that (judge, port) precedes it in the chain, the
 *                        registration's signature verifies, and the registering key is trusted. With no
 *                        trusted key configured every verdict is `judgeUnanchored` (a FAIL), never a PASS.
 *
 * What the lane can still do: mint its own "orchestrator" key and trust it in its OWN runs. The
 * orchestrator's grading run trusts only the orchestrator's key, whose private half never enters a
 * lane tree (the CLI refuses key files inside any worktree), and the verdict line prints the
 * fingerprint of every key it trusted.
 */
const b64Pub = (keyObj) => createPublicKey(keyObj).export({ type: 'spki', format: 'der' }).toString('base64');
const fingerprint = (b64) => { try { return sha256(Buffer.from(String(b64), 'base64')).slice(0, 16); } catch { return null; } };
const verifySig = (pubB64, msg, sigB64) => {
  try { return cryptoVerify(null, Buffer.from(msg), createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' }), Buffer.from(sigB64, 'base64')); }
  catch { return false; }
};
const regMessage = (r) => ['cal-judge-registration', 'v1', r.judge, String(r.port), r.judgePub, r.at].join('\n');
const verdictMessage = (v) => ['cal-judge-verdict', 'v1', v.sealId, v.id, v.frameSha256, String(v.pass), v.judge, String(v.port),
  sha256(String(v.rationale ?? '')), String(v.reference ?? ''), v.at].join('\n');
function trustedOrchestratorKeys() {
  let raw = process.env.CAL_ORCHESTRATOR_PUBKEY || '';
  if (process.env.CAL_ORCHESTRATOR_PUBKEY_FILE) { try { raw += ',' + read(process.env.CAL_ORCHESTRATOR_PUBKEY_FILE); } catch { /* unreadable: trusts nothing more */ } }
  return new Set(raw.split(/[\s,]+/).map((x) => x.trim()).filter((x) => x.length > 40));
}
/** valid (signature-verified) judge registrations, by judge public key */
function registrationIndex(L) {
  const idx = new Map();
  for (const { entry: r } of L.entries) {
    if (r.kind !== 'judge-registered') continue;
    const ok = typeof r.orchestratorPub === 'string' && typeof r.sig === 'string' && verifySig(r.orchestratorPub, regMessage(r), r.sig);
    if (!idx.has(r.judgePub)) idx.set(r.judgePub, []);
    idx.get(r.judgePub).push({ ...r, sigOk: ok });
  }
  return idx;
}

/**
 * An R29 verdict counts only when complete, from a judge port that is not the run's, bound to THIS
 * frame of THIS seal, signed by its judge key, and that key registered by a trusted orchestrator key.
 * -> { ok, unanchored, why, registeredBy }
 */
function judgeFacts(v, seal, id, regs = new Map(), trusted = new Set()) {
  const why = [];
  if (!v || typeof v !== 'object') return { ok: false, why: ['no verdict'] };
  if (typeof v.pass !== 'boolean') why.push('pass is not a boolean');
  if (typeof v.rationale !== 'string' || v.rationale.trim().length < 20) why.push('rationale missing or < 20 chars');
  if (typeof v.judge !== 'string' || !v.judge.trim()) why.push('judge (who) missing');
  if (!JUDGE_PORT_OK(Number(v.port))) why.push('port ' + v.port + ' is not a judge port (5271, 5280-5299)');
  else if (Number(v.port) !== 5271) why.push('R33 (c): carried visual rows are judged on port 5271, not ' + v.port);
  if (Number(v.port) === Number(seal.port)) why.push('judged on the port that ran the suite');
  if (v.sealId !== seal.sealId || v.id !== id) why.push('verdict is for another run or row');
  if (!seal.frames?.[id] || v.frameSha256 !== seal.frames[id]) why.push('frameSha256 is not the sealed frame');
  if (typeof v.judgePub !== 'string' || typeof v.sig !== 'string') why.push('unsigned verdict (fix round 3: a verdict is signed with a registered judge key)');
  else if (!verifySig(v.judgePub, verdictMessage(v), v.sig)) why.push('the verdict signature does not verify under its judge key');
  const reg = (regs.get(v.judgePub) || []).filter((r) => r.sigOk && r.judge === v.judge && Number(r.port) === Number(v.port) && (r.seq ?? 0) < (v.seq ?? Infinity));
  if (typeof v.judgePub === 'string' && !reg.length) why.push('no orchestrator-signed registration of this judge key for (' + v.judge + ', port ' + v.port + ') before the verdict');
  const anchored = reg.filter((r) => trusted.has(r.orchestratorPub));
  const registeredBy = [...new Set(reg.map((r) => fingerprint(r.orchestratorPub)))];
  return { ok: why.length === 0 && anchored.length > 0, unanchored: why.length === 0 && anchored.length === 0, why, registeredBy };
}

/** Plan §9: who absorbs a Round-4 row, i.e. who fixes it or asks the orchestrator for the ruling. A §8.3 ruling
 *  that routes a row's fix to another lane overrides it (W0b fix round 1): R34 gives A90b to instruments-core. */
const RULED_OWNER = Object.freeze({ 'A90b-memory-attribution': 'instruments-core (R34: the machine.js model clone + autorig.js bones retained after the Tiller workload)' });
const ownerOf = (g) => RULED_OWNER[g?.id] || g?.absorbedBy || 'orchestrator';

/** Plan §8 rulings that name a gate ("- **R11 — A17 flourish frames …"), keyed by the gate's short id (A17). */
function planRulings() {
  const plan = read(path.join(ROOT, 'docs', 'ROUND5-PLAN.md'));
  const sec = plan.slice(plan.indexOf('## 8. Rulings'), plan.indexOf('## 9. GATE SPEC'));
  const out = {};
  for (const block of sec.split(/\n(?=- \*\*R\d+)/)) {
    const m = /^- \*\*(R\d+)[^*]*\*\*\s*([\s\S]*)$/.exec(block.trim());
    if (!m) continue;
    const text = block.trim().replace(/^- /, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 220);
    for (const id of new Set([...block.matchAll(/\b(A\d+[a-z]?)\b/g)].map((x) => x[1]))) (out[id] = out[id] || []).push(text);
  }
  return out;
}

/** The carried rows THIS invocation of gates.mjs executes (same selection rules as gates.mjs). */
function carriedRowsThisInvocation(ALL) {
  if (!IS_GATES_RUN) return [];
  const only = argFlag('--only', null)?.split(',').map((s) => s.trim());
  const lane = argFlag('--lane', null);
  let sel = ALL || [];
  if (only) sel = sel.filter((g) => only.includes(g.id));
  if (lane) sel = sel.filter((g) => g.lane === lane);
  return sel.filter((g) => CARRIED_IDS.has(g.id)).map((g) => g.id);
}

/** Every seal of this tree (newest first) with whether it can be graded now, and why not. */
function sealsOfTree(L, { port = null, explicit = [] } = {}, now, head) {
  const tree = realpathSync(ROOT);
  const seals = L.entries.map((e) => e.entry).filter((e) => e.kind === 'seal' && e.tree === tree
    && (explicit.length ? explicit.includes(e.sealId) : port == null || Number(e.port) === Number(port))).reverse();
  return seals.map((s) => {
    const why = [];
    if (s.build?.atStart?.digest !== s.build?.atEnd?.digest) why.push('the build changed DURING the run');
    if (now && s.build?.atEnd?.digest !== now.digest) why.push(`stale: the build changed after the run (newest file now ${now.newest.file} @ ${now.newest.mtime})`);
    // (W0b) git HEAD is RECORDED, not compared: the orchestrator checkpoints every lane tree with WIP commits while
    // lanes run (~every 25 min), which moves HEAD without touching a file; the build fingerprint (size + mtime of
    // every runtime, harness and carried-row file) is what says whether the run measured this build
    // fix round 3: frames bound at capture + the run's own 5173/cache/box monitor; an older seal has neither
    if (!(s.sealVersion >= SEAL_VERSION)) why.push(`seal v${s.sealVersion || 2}: frames not capture-bound and no run monitor (fix round 3 needs v${SEAL_VERSION})`);
    // a report or monitor copy is never pruned: a missing or edited one is TAMPERING, and fails the gate
    const rf = path.join(LEDGER_RUNS, s.sealId, 'report.json');
    let rep = null, tampered = null;
    if (!existsSync(rf)) tampered = 'its report copy is gone (report copies are never pruned)';
    else {
      const b = readFileSync(rf);
      if (sha256(b) !== s.reportSha256) tampered = 'its report copy does not match the seal (edited)';
      else { try { rep = JSON.parse(b); } catch { tampered = 'its report copy is unparseable'; } }
    }
    if (!tampered && s.monitorSha256) {
      const mf = path.join(LEDGER_RUNS, s.sealId, 'monitor.json');
      if (!existsSync(mf)) tampered = 'its run-monitor copy is gone (never pruned)';
      else if (sha256(readFileSync(mf)) !== s.monitorSha256) tampered = 'its run-monitor copy does not match the seal (edited)';
    }
    if (tampered) why.push(tampered);
    return { seal: s, rep, why, tampered };
  });
}

/** Every verdict per (sealId, id), oldest first: the newest one that VERIFIES counts (an invalid later
 *  entry can neither forge a PASS nor erase a valid verdict). */
function verdictIndex(L) {
  const idx = new Map();
  for (const { entry: e } of L.entries) {
    if (e.kind !== 'verdict') continue;
    const k = e.sealId + '|' + e.id;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(e);
  }
  return idx;
}

/**
 * FIX ROUND 3: a row the HARNESS could not observe (its own `infra:` label — e.g. the disk preflight refusing a
 * Chrome relaunch mid-run, which then fails every remaining row in 6 ms — or `browser lost` after three fresh
 * browsers) is not a measurement of the build. It is neutral in that run, and a run holding any such row is
 * INCOMPLETE: it never counts toward the minimum of complete runs and its frames are never the judged ones, but
 * every real result in it (a FAIL, an unattributed PENDING) still counts against its row.
 */
const isInfraResult = (r) => !!r && ((typeof r.error === 'string' && /^infra:/.test(r.error)) || r.detail?.reason === 'browser lost');

/** One carried row in one sealed run -> { cls, status, note, shot?, judge? } */
async function classifyRow(g, r, run, verdicts, gradeVisual, trust = { regs: new Map(), trusted: new Set() }) {
  const out = { status: r?.status ?? null };
  const d = r ? (typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail ?? r.error ?? '')) : '';
  if (!r) return { ...out, cls: 'unrun', note: 'no result in this run' };
  if (isInfraResult(r)) return { ...out, cls: 'infra', note: 'not measured in this run: ' + String(r.error || r.detail?.reason || '').slice(0, 140) };
  if (/roleOverride/.test(d)) return { ...out, cls: 'override', note: 'mechanics-validation run (CAL_GATE_ROLE_OVERRIDE)' };
  if (r.status === 'PASS') return { ...out, cls: 'pass' };
  if (r.status === 'FAIL' || r.status === 'ERROR') return { ...out, cls: 'fail', note: d.slice(0, 200) };
  if (r.status !== 'NEEDS-JUDGE') {
    // (W0b) the SKIP label is read from the HEAD of the row's verdict, not from anywhere in its detail: A21 reports
    // its R18 scenario fallbacks (which quote SKIP-legacy-deleted notes) inside a PENDING verdict, and read as skipR30
    const head = typeof r.detail === 'string' ? r.detail : typeof r.detail?.verdict === 'string' ? r.detail.verdict : d;
    // W0b fix round 3 (R45): a quiet-box term reported PENDING-quiet-box is graded at the orchestrator's quiet 5270 run
    const cls = skipClassOf(String(head).slice(0, 160)) || (/^PENDING-quiet-box \(R45\)/.test(String(head)) ? 'pendingQuietBox' : ATTRIBUTION.test(d) ? 'pendingAttributed' : 'pendingUnattributed');
    return { ...out, cls, note: d.slice(0, 200) };
  }
  // a visual row: the frame this run filmed, as the run copied it into the ledger
  const seal = run.seal;
  const frame = path.join(LEDGER_RUNS, seal.sealId, g.id + '.png');
  out.shot = frame;
  // an older run past the frame-retention window: its seal says it filmed the frame, the copy is pruned
  if (!gradeVisual && seal.frames?.[g.id] && !existsSync(frame)) return { ...out, cls: 'filmedPruned', note: 'frame pruned (retention): filmed, SKIP card or not unknown' };
  if (!seal.frames?.[g.id] || !existsSync(frame)) return { ...out, cls: 'shotInvalid', note: (seal.framesNotFilmed || []).includes(g.id) ? 'this run did not film the frame (no fresh PNG at exit)' : 'frame copy missing' };
  if (sha256(readFileSync(frame)) !== seal.frames[g.id]) return { ...out, cls: 'shotInvalid', note: 'frame copy does not match the seal (edited)' };
  let src = '';
  try { src = [g.setup, g.assert].filter((x) => typeof x === 'string').join('\n'); } catch { src = ''; }
  if (/__skipCard\(/.test(src) && await isSkipCard(frame)) {
    // the frame IS the SKIP card the row draws when its subject cannot stage; its label is the row's
    // own SKIP text (the roster prelude, which lists every label, removed), else its first role's
    const own = src.split(ROSTER).join('');
    const labels = [...new Set([...own.matchAll(/SKIP-legacy-deleted|SKIP-legacy \(R28\)|SKIP-R18/g)].map((m) => m[0]))];
    const role0 = (g.requires?.roles || [])[0];
    const cls = labels.length === 1 ? skipClassOf(labels[0]) : role0 && ROLE_PENDING[role0] ? skipClassOf(ROLE_PENDING[role0].label) : 'skipR18';
    return { ...out, cls, note: 'the filmed frame is the SKIP card (subject not staged in this build)' };
  }
  if (/__failCard\(/.test(src) && await isFailCard(frame)) {
    // the row's OWN staging assertion failed (e.g. V13 filmed without the aim, R33 g): a FAIL by name, never a skip
    return { ...out, cls: 'fail', note: 'the filmed frame is the row\'s STAGING FAILED card (its own staging assertion failed; the reason is printed on the card)' };
  }
  if (!gradeVisual) return { ...out, cls: 'filmed' };
  const all = verdicts.get(seal.sealId + '|' + g.id) || [];
  if (!all.length) return { ...out, cls: 'awaitingJudge', note: `no R29 verdict for ${seal.sealId} / ${g.id} (frame ${seal.frames[g.id].slice(0, 12)})` };
  const facts = all.map((v) => ({ v, f: judgeFacts(v, seal, g.id, trust.regs, trust.trusted) }));
  const good = facts.filter((x) => x.f.ok).pop();
  const pick = good || facts[facts.length - 1];
  const v = pick.v;
  const judge = { pass: v.pass, judge: v.judge, port: v.port, at: v.at, verdicts: all.length, valid: facts.filter((x) => x.f.ok).length,
    judgeKey: fingerprint(v.judgePub), registeredBy: pick.f.registeredBy, reference: v.reference || null };
  if (!good) {
    const unanchored = facts.some((x) => x.f.unanchored);
    return { ...out, judge, cls: unanchored ? 'judgeUnanchored' : 'judgeInvalid',
      note: unanchored ? `signed and registered, but by orchestrator key ${pick.f.registeredBy.join(', ') || '?'}, which this grader does not trust (CAL_ORCHESTRATOR_PUBKEY: ${trust.trusted.size ? [...trust.trusted].map(fingerprint).join(', ') : 'unset'})`
        : pick.f.why.join('; ') };
  }
  return { ...out, judge, cls: v.pass ? 'pass' : 'fail', note: (v.pass ? 'R29 PASS: ' : 'R29 FAIL: ') + String(v.rationale).slice(0, 160) };
}

/* ------------------------------------------------------------------------ */
/* R33 (plan §8.3, Oct 18): A-carried-suite is a REGRESSION GUARD against the Round-4 baseline */
/* ------------------------------------------------------------------------ */
/**
 * (a) The baseline: every carried row's verdict on the W0-day1 base (0b75036), recorded ONCE in
 *     tools/gates/carried-baseline.json from sealed runs of that base (`--carried-baseline`), with each
 *     run's box sample. It is ANCHORED one of two ways: (1) when its sealed runs are in the ledger the
 *     gate re-derives every row from their report copies (a baseline that does not match its own runs
 *     FAILs); (2) otherwise (a fresh ledger: the orchestrator's own, or a $TMPDIR the machine lost, as on
 *     Oct 22) the file must be byte-identical to the version that FIRST added it to git — recorded once,
 *     never edited — and internally consistent (every verdict follows from its per-run classes).
 * (b) Action rows, over every observation of this build (W0b, orchestrator: the full suite runs ONCE per
 *     round, so a full carried run is one observation of every row and a sealed PARTIAL run, `--only` of
 *     carried ids, is one more observation of the rows it ran):
 *       PASS at baseline  -> PASS in every observation (R30: SKIP-legacy-deleted is allowed, its subject
 *                            was deleted at W0a and the row names it until the replacement lands; a
 *                            Round-4-ATTRIBUTED PENDING — the box could not be measured — is no observation,
 *                            and at least one measured PASS is needed);
 *       known-flaky       (A13 under R27, and every row the baseline shows flaky) -> the FIRST 5
 *                            observations on this build decide: >= 3 PASS (re-running cannot replace them);
 *       FAIL / PENDING    -> listed, not graded, but never WORSE (pass > named SKIP or attributed PENDING >
 *                            unattributed PENDING > FAIL);
 *       SKIP at baseline, staged now (R28: the Tiller fixture took the herd role) -> NEWLY STAGED: listed
 *                            with its result and owner (there is no Round-4 verdict on that content to
 *                            regress from; the owner's own must-stay-green list grades it).
 * (c) Visual rows: only the KEPT systems (V1-V4, V12-V14, V21; plus any row a lane has re-staged by
 *     shadowing it) are graded, by a signed R29 verdict from port 5271 on the newest complete full run's
 *     frame; every other visual row is SKIP-replaced, naming its absorbing lane.
 * (d) Integrity: sealed runs only (seal v3: capture-bound frames, run id in the frame path and the
 *     report, the run's own monitor); a stale, forged, tampered or self-judged report FAILs.
 * THE BOX: each run's quiet fraction is reported beside the baseline's lowest; a louder run is still graded
 * (a loud box can only make a row worse) and says so; the orchestrator's quiet-box run on 5270 is the
 * authoritative one.
 */
const BASELINE_FILE = path.join(TOOLS, 'gates', 'carried-baseline.json');
const BASELINE_REL = 'tools/gates/carried-baseline.json';
const BASE_COMMIT = '0b75036';
const KEPT_VISUAL = ['V1-sprint-frame', 'V2-idle-frame', 'V3-crouch-stalk', 'V4-aim-anchor', 'V12-sprint-vs-reference',
  'V13-aim-strafe', 'V14-slope-contour', 'V21-camera-cover'];
const R27_FLAKY = ['A13-no-skate'];
/**
 * R33 (g) (main PLAN §8.3, Oct 19, commit a3465f1; W0b fix round 1): "A carried row that an active lane shadows by
 * id (§3.3) is graded by that lane, not by A-carried-suite: the animator rows V1–V4, V12–V14 and the action rows
 * A2–A19, A28, A31–A33 are graded by hero-body on Brea in W0b (the W0a grading of V2, V4, V12 on the old body is
 * void). A-carried-suite reports them SKIP-shadowed(hero-body) until hero-body's exit, then grades them on the merged
 * build." The id ranges are the ruling's; a row in them is hero-body's when its §9 absorbing lane is hero-body (the
 * §9 table gives A4/A5 to armory, A6–A8 to the per-kind block, A9 to gates-perf + engine-gpu and A10 to shell-ui,
 * all inside "A2–A19"; those stay graded here). V21-camera-cover stays graded here (R33 c).
 * After hero-body's exit the orchestrator grades them on the merged build with CAL_SHADOW_EXITED=hero-body.
 */
const R33G = Object.freeze({ lane: 'hero-body', ranges: { V: [[1, 4], [12, 14]], A: [[2, 19], [28, 28], [31, 33]] } });
const R33G_EXITED = new Set(String(process.env.CAL_SHADOW_EXITED || '').split(',').map((x) => x.trim()).filter(Boolean));
function r33gShadowed(g) {
  const m = /^([AV])(\d+)(?:[a-z])?(?:-|$)/.exec(g.id);
  if (!m) return false;
  const n = Number(m[2]);
  const inRange = (R33G.ranges[m[1]] || []).some(([a, b]) => n >= a && n <= b);
  return inRange && ownerOf(g) === R33G.lane && !R33G_EXITED.has(R33G.lane);
}
const FLAKY_WINDOW = 5, FLAKY_PASSES = 3;
const VISUAL_JUDGE_PORT = 5271;
/** complete FULL carried runs of this build the gate needs (one per round, orchestrator W0b); CAL_CARRIED_RUNS raises it */
const MIN_FULL_RUNS = Math.max(1, Math.floor(Number(process.env.CAL_CARRIED_RUNS) || 1));
const RANK = (c) => (c === 'pass' ? 4 : /^skip/.test(c) || c === 'pendingAttributed' || c === 'pendingQuietBox' ? 3 : c === 'pendingUnattributed' ? 2 : c === 'fail' ? 1 : 0);
/**
 * R47 (plan §8.3, Oct 22): the carried player-melee rows A100-A107 are staged on the Round-4 spear, which CALIMA replaces
 * with the lance; melee's W1 row owns "lance tables on Brea, A100-A107". At the W0b exit A-carried-suite reports them
 * SKIP-replaced (melee W1), each listed by name, never counted as PASS; they are graded on Brea with the lance at
 * melee's W1 exit (CAL_SHADOW_EXITED is not involved: melee re-stages them by shadowing the ids).
 */
const R47_ROWS = Object.freeze(['A100-spear-holster', 'A101-spear-grip', 'A102-melee-body-motion', 'A103-melee-contact-sync', 'A104-melee-self-clear',
  'A105-melee-while-moving', 'A106-melee-approach-immovable', 'A107-draw-arm-path']);
/**
 * R48 (a) / (d) and R45: offenders that belong to ANOTHER lane or are RULED, so that A-carried-suite in gates-perf's lane
 * run reports PENDING-orchestrator (R48 d) instead of FAIL. Anything not named here (or in RULED_OWNER) is this lane's.
 *   - a baseline-PASS row whose every observation is a quiet-box PENDING (A9's fps term, R45) -> the orchestrator's
 *     quiet 5270 run;
 *   - a kept visual row awaiting its R29 judge (V21) -> the orchestrator's judge (R48 d).
 */
const RULED_CLASS_OWNER = Object.freeze({ needsQuietBox: 'orchestrator (R45: quiet-box terms are graded at the quiet 5270 global run)',
  awaitingJudge: 'orchestrator (R48 d: V21 is judged by the orchestrator\'s R29 judge on port 5271)' });
const ORCHESTRATOR_PORT = 5270;
const BAD_ACTION_R33 = ['override', 'unrun', 'regression', 'needsRuns', 'needsQuietBox', 'worseThanBaseline', 'stagingFlaky'];

/** a row's baseline verdict from its classes in the baseline runs (infra = not observed) */
function baselineVerdict(kind, classes) {
  if (kind === 'visual') return 'n/a (R33 c)';
  const obs = classes.filter((c) => c !== 'infra');
  if (!obs.length) return 'unobserved';
  if (obs.every((c) => c === 'pass')) return 'pass';
  if (obs.some((c) => c === 'pass')) return 'flaky';
  return obs.slice().sort((a, b) => RANK(a) - RANK(b))[0];
}

/** classes of every ACTION carried row in the given sealed runs, re-derived from the ledger's report copies */
async function baselineFromSeals(L, sealIds) {
  const all = L.entries.map((e) => e.entry);
  const runs = [];
  for (const id of sealIds) {
    const s = all.find((e) => e.kind === 'seal' && e.sealId === id);
    if (!s) throw new Error(`baseline seal ${id} is not in the ledger`);
    const b = readFileSync(path.join(LEDGER_RUNS, id, 'report.json'));
    if (sha256(b) !== s.reportSha256) throw new Error(`baseline seal ${id}: its report copy does not match the seal`);
    const rep = JSON.parse(b);
    runs.push({ seal: s, byId: new Map((rep.results || []).map((r) => [r.id, r])) });
  }
  const rows = {};
  for (const g of CARRIED) {
    if (g.kind === 'visual') { rows[g.id] = { kind: 'visual', verdict: baselineVerdict('visual', []) }; continue; }
    const per = [];
    for (const run of runs) per.push((await classifyRow(g, run.byId.get(g.id), { seal: run.seal }, new Map(), false)).cls);
    rows[g.id] = { kind: g.kind, perRun: per, verdict: baselineVerdict(g.kind, per) };
  }
  return {
    runs: runs.map(({ seal: s, byId }) => ({ sealId: s.sealId, reportSha256: s.reportSha256, startedAt: s.startedAt, endedAt: s.endedAt,
      load: s.load, box: s.monitor?.box || null, monitorSamples: s.monitor?.samples ?? null, buildDigest: s.build?.atEnd?.digest,
      infraRows: [...byId.values()].filter((r) => CARRIED_IDS.has(r.id) && isInfraResult(r)).length })),
    rows,
  };
}

/** CLI: node tools/gates.r5.gates-perf.mjs --carried-baseline --seals <id,id,…> [--out <file>] */
async function baselineCli() {
  const ids = String(argFlag('--seals', '') || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!ids.length) { console.error('[baseline] --seals <sealId,…> (sealed carried runs of the W0-day1 base runtime)'); return 2; }
  const L = readLedger();
  if (!L.ok) { console.error(`[baseline] ledger broken at line ${L.brokenAt}: ${L.why}`); return 2; }
  const servedBy = String(argFlag('--served-by', '') || '').trim();
  if (!servedBy) { console.error('[baseline] --served-by <commit whose runtime the runs served> (its runtime is diffed against the base)'); return 2; }
  const rt = ['src', 'public', 'index.html', 'vite.config.js', 'package.json'];
  const diff = spawnSync('git', ['-C', ROOT, 'diff', '--name-status', BASE_COMMIT, servedBy, '--', ...rt], { encoding: 'utf8' });
  if (diff.status !== 0) { console.error('[baseline] git diff failed: ' + diff.stderr); return 2; }
  const runtimeDiff = diff.stdout.split('\n').filter(Boolean);
  const notDeletion = runtimeDiff.filter((l) => !/^D\t/.test(l));
  const carriedThen = spawnSync('git', ['-C', ROOT, 'show', `${servedBy}:tools/gates.r5.carried.mjs`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  const b = await baselineFromSeals(L, ids);
  const tally = {};
  for (const r of Object.values(b.rows)) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  const out = {
    rule: 'R33 (a): each carried row\'s verdict on the W0-day1 base, recorded once, with the runs\' box samples. Action rows: pass | flaky | fail | pendingAttributed | pendingUnattributed | skipR18/R28/R30 (the worst observed). Visual rows are graded under R33 (c), not from this file.',
    base: BASE_COMMIT, recordedAt: new Date().toISOString(),
    evidence: { servedBy, runtimeDiffVsBase: runtimeDiff, runtimeDiffIsDeletionsOnly: notDeletion.length === 0,
      carriedSha256AtRuns: carriedThen.status === 0 ? sha256(carriedThen.stdout) : null, carriedRows: CARRIED.length },
    runs: b.runs, verdictTally: tally, rows: b.rows,
  };
  const file = path.resolve(argFlag('--out', BASELINE_FILE));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(`[baseline] ${rel(file)}: ${ids.length} run(s), ${JSON.stringify(tally)}; runtime vs ${BASE_COMMIT}: ${runtimeDiff.length} path(s), deletions only: ${notDeletion.length === 0}`);
  return 0;
}

/**
 * The baseline file, anchored (R33 a): re-derived from its own sealed runs when they are in this ledger,
 * else byte-identical to the version that FIRST added it to git (recorded once) and internally consistent.
 */
async function loadBaseline(L) {
  let raw, f;
  try { raw = readFileSync(BASELINE_FILE); f = JSON.parse(raw); } catch (e) { return { ok: false, why: `no baseline file ${rel(BASELINE_FILE)} (R33 a): ${String(e.message).slice(0, 80)}` }; }
  const ids = (f.runs || []).map((r) => r.sealId);
  if (!ids.length) return { ok: false, why: 'the baseline names no sealed run' };
  if (f.base !== BASE_COMMIT) return { ok: false, why: `the baseline is of ${f.base}, not ${BASE_COMMIT}` };
  if (!f.evidence?.runtimeDiffIsDeletionsOnly) return { ok: false, why: 'the baseline runs did not serve the base runtime (non-deletion changes vs ' + BASE_COMMIT + ')' };
  const missing = CARRIED.filter((g) => !f.rows?.[g.id]).map((g) => g.id);
  if (missing.length) return { ok: false, why: `${missing.length} carried row(s) have no baseline: ${missing.slice(0, 5).join(', ')}` };
  // internally consistent: every action row's verdict follows from its per-run classes, and the tally is the rows'
  const inconsistent = Object.entries(f.rows).filter(([, r]) => r.kind !== 'visual' && baselineVerdict(r.kind, r.perRun || []) !== r.verdict).map(([id]) => id);
  if (inconsistent.length) return { ok: false, why: `${inconsistent.length} baseline row(s) whose verdict does not follow from their per-run classes (edited?): ${inconsistent.slice(0, 5).join(', ')}` };
  const tally = {};
  for (const r of Object.values(f.rows)) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  const norm = (t) => JSON.stringify(Object.keys(t || {}).sort().map((k) => [k, t[k]]));
  if (norm(tally) !== norm(f.verdictTally)) return { ok: false, why: `the baseline's verdictTally ${norm(f.verdictTally)} is not its rows' ${norm(tally)}` };
  const inLedger = ids.filter((id) => L.entries.some((e) => e.entry.kind === 'seal' && e.entry.sealId === id));
  if (inLedger.length === ids.length) {
    let again;
    try { again = await baselineFromSeals(L, ids); } catch (e) { return { ok: false, why: e.message }; }
    const mismatched = Object.keys(again.rows).filter((id) => again.rows[id].kind !== 'visual'
      && (f.rows?.[id]?.verdict !== again.rows[id].verdict || JSON.stringify(f.rows?.[id]?.perRun) !== JSON.stringify(again.rows[id].perRun)));
    if (mismatched.length) return { ok: false, why: `${mismatched.length} row(s) of the baseline file differ from its sealed runs (edited?): ${mismatched.slice(0, 5).join(', ')}` };
    return { ok: true, file: f, anchor: `ledger: re-derived from its ${ids.length} sealed runs in ${L.file}` };
  }
  if (inLedger.length) return { ok: false, why: `only ${inLedger.length} of the baseline's ${ids.length} sealed runs are in this ledger (${inLedger.join(', ')}): a partial ledger cannot anchor it` };
  // the git anchor: recorded ONCE — the working copy is byte for byte the version that first added the file
  const log = spawnSync('git', ['-C', ROOT, 'log', '--diff-filter=A', '--format=%H %cI', '--', BASELINE_REL], { encoding: 'utf8' });
  const adds = (log.stdout || '').trim().split('\n').filter(Boolean);
  if (log.status !== 0 || !adds.length) return { ok: false, why: `its ${ids.length} sealed runs are not in this ledger (${L.file}) and the file was never committed: unanchored (record it with --carried-baseline in a ledger the grader holds, or have the orchestrator commit it)` };
  const [first, at] = adds[adds.length - 1].split(' ');
  const committed = spawnSync('git', ['-C', ROOT, 'show', `${first}:${BASELINE_REL}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
  if (committed.status !== 0) return { ok: false, why: `git show ${first.slice(0, 10)}:${BASELINE_REL} failed` };
  if (!Buffer.from(committed.stdout).equals(raw)) return { ok: false, why: `the working copy differs from the version first committed in ${first.slice(0, 10)} (${at}): the baseline is recorded once and never edited` };
  return { ok: true, file: f, anchor: `git: byte-identical to the version first committed in ${first.slice(0, 10)} (${at}); its ${ids.length} sealed runs are not in this ledger (${L.file})` };
}

/** every gate id THIS invocation of gates.mjs selects (the harness's --only / --lane rules) */
function selectedThisInvocation(ALL) {
  if (!IS_GATES_RUN) return [];
  const only = argFlag('--only', null)?.split(',').map((s) => s.trim());
  const lane = argFlag('--lane', null);
  let sel = ALL || [];
  if (only) sel = sel.filter((g) => only.includes(g.id));
  if (lane) sel = sel.filter((g) => g.lane === lane);
  return sel.map((g) => g.id);
}

async function carriedSuite({ PORT, GATES: ALL }) {
  const comp = carriedComposition();
  const inRun = carriedRowsThisInvocation(ALL);
  if (inRun.length) {
    return { pass: false, detail: { verdict: `FAIL: refused — this invocation also executes ${inRun.length} carried row(s) (${inRun.slice(0, 5).join(', ')}${inRun.length > 5 ? ', …' : ''}), whose frames and report it is rewriting; grade sealed runs in an invocation of their own: node tools/gates.mjs --port ${PORT} --only A-carried-suite`,
      composition: comp } };
  }
  const where = ledgerOutsideTrees();
  if (!where.ok) return { pass: false, detail: { verdict: `FAIL: the run ledger ${where.ledger} lies inside the worktree ${where.insideTree}; it must live outside every tree (CAL_GATE_LEDGER)`, composition: comp } };
  const L = readLedger();
  if (!L.ok) return { pass: false, detail: { verdict: `FAIL: the run ledger ${L.file} is broken at line ${L.brokenAt}: ${L.why}`, composition: comp } };
  const base = await loadBaseline(L);
  if (!base.ok) return { pass: false, detail: { verdict: 'FAIL: R33 (a) baseline: ' + base.why, composition: comp } };
  const cfg = await import('./gates.config.mjs');
  const shadows = shadowFilesOf(cfg);
  const shadowedIds = new Set((cfg.SHADOWED || []).map((x) => x.id));
  const now = buildFingerprint(shadows);
  const head = gitHead();
  const explicit = (process.env.CAL_CARRIED_SEALS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const considered = sealsOfTree(L, { port: PORT, explicit }, now, head);
  const tampered = considered.filter((c) => c.tampered).map((c) => ({ sealId: c.seal.sealId, why: c.tampered }));
  if (tampered.length) {
    return { pass: false, detail: { verdict: `FAIL: ${tampered.length} sealed run(s) of this tree and port were tampered with after sealing: ` + tampered.map((t) => t.sealId + ' (' + t.why + ')').join('; '),
      composition: comp, tampered } };
  }
  // EVERY fresh sealed run of this exact build is an observation (no run can be dropped after the fact). The
  // box is reported, not used to drop a run: each run's own monitor gives its quiet fraction (samples with a
  // 1-minute load < 3 and no other gate Chrome), compared with the baseline runs' lowest.
  const quietFrac = (box, n) => (box && n ? (box.quietSamples || 0) / n : null);
  const baseQuiet = Math.min(...base.file.runs.map((r) => quietFrac(r.box, r.monitorSamples) ?? 1));
  // W0b fix round 3: a seal of a run that executed no carried row (an R48 b instrument run) is no carried observation
  const fresh = considered.filter((c) => c.why.length === 0 && (c.seal.carriedRows ?? 1) > 0);
  for (const c of fresh) {
    c.partial = c.seal.partial === true;
    c.infraRows = (c.rep?.results || []).filter((r) => CARRIED_IDS.has(r.id) && isInfraResult(r)).map((r) => r.id);
    c.complete = c.infraRows.length === 0;
    c.quietFraction = quietFrac(c.seal.monitor?.box, c.seal.monitor?.samples);
    c.louderThanBaseline = !(c.quietFraction != null && c.quietFraction >= baseQuiet - 1e-9);
  }
  const chrono = fresh.slice().sort((a, b) => Date.parse(a.seal.startedAt) - Date.parse(b.seal.startedAt));   // oldest first
  const fullRuns = fresh.filter((c) => !c.partial);                       // newest first
  const completeFull = fullRuns.filter((c) => c.complete);
  const partialRuns = fresh.filter((c) => c.partial);
  const incompleteRuns = fresh.filter((c) => !c.complete).map((c) => ({ sealId: c.seal.sealId, partial: c.partial, infraRows: c.infraRows.length,
    first: c.infraRows.slice(0, 3), why: String((c.rep.results || []).find((r) => isInfraResult(r))?.error || 'browser lost').slice(0, 120) }));
  const tree0 = realpathSync(ROOT);
  const sealedRunIds = new Set(L.entries.map((e) => e.entry).filter((e) => e.kind === 'seal' && e.runId).map((e) => e.runId));
  const unsealedStarts = L.entries.map((e) => e.entry).filter((e) => e.kind === 'run-start' && e.tree === tree0 && Number(e.port) === Number(PORT)
      && e.build === now.digest && !sealedRunIds.has(e.runId) && (e.carriedRowsSelected ?? 1) > 0)
    .map((e) => ({ runId: e.runId, at: e.at, partial: !!e.partial, state: e.pid !== process.pid && pidAliveP(e.pid) ? 'running now' : 'never sealed (aborted or crashed)' }));
  const boxOf = (c) => `quiet ${c.quietFraction == null ? '?' : (c.quietFraction * 100).toFixed(0) + ' %'}${c.louderThanBaseline ? ' (LOUDER than the baseline\'s ' + (baseQuiet * 100).toFixed(0) + ' %)' : ''}, load max ${c.seal.monitor?.box?.loadMax}, other gate Chromes max ${c.seal.monitor?.box?.otherGateChromesMax}`;
  const runsLine = `${fullRuns.length} full: ` + (fullRuns.map((c) => `${c.seal.sealId} (${c.seal.reportStamp}, ${boxOf(c)}${c.complete ? '' : `, INCOMPLETE: ${c.infraRows.length} row(s) not observed by the harness`})`).join('; ') || 'none')
    + (partialRuns.length ? `; ${partialRuns.length} partial: ${partialRuns.map((c) => `${c.seal.sealId} (${(c.rep?.results || []).filter((r) => CARRIED_IDS.has(r.id)).map((r) => r.id).join(' ')}; ${boxOf(c)})`).join('; ')}` : '')
    + (unsealedStarts.length ? `; ${unsealedStarts.length} run(s) started on this build and not sealed: ${unsealedStarts.map((u) => u.runId + ' (' + u.state + ')').join(', ')}` : '');
  const ledgerInfo = { file: L.file, entries: L.entries.length, head: L.head.slice(0, 16), runsDir: LEDGER_RUNS };
  const notGraded = considered.filter((c) => c.why.length).slice(0, 8).map((c) => ({ sealId: c.seal.sealId, stamp: c.seal.reportStamp, partial: c.seal.partial === true, why: c.why }));
  const baselineInfo = { file: rel(BASELINE_FILE), base: base.file.base, runs: base.file.runs.map((r) => r.sealId), recordedAt: base.file.recordedAt, verdictTally: base.file.verdictTally,
    anchor: base.anchor, lowestQuietFraction: +baseQuiet.toFixed(3),
    carriedChangedSinceBaseline: base.file.evidence?.carriedSha256AtRuns !== sha256(readFileSync(path.join(TOOLS, 'gates.r5.carried.mjs'))) };
  if (completeFull.length < MIN_FULL_RUNS) {
    return { pass: false, detail: {
      verdict: `FAIL: ${completeFull.length} complete fresh sealed FULL carried run(s) of this tree on port ${PORT}${explicit.length ? ' (CAL_CARRIED_SEALS)' : ''}${incompleteRuns.length ? ` (+${incompleteRuns.length} incomplete)` : ''}; the gate needs ${MIN_FULL_RUNS}. Run node tools/gates.mjs --port ${PORT} --lane carried on an unchanged build, then re-run the known-flaky rows with --only until their first ${FLAKY_WINDOW} observations decide, then judge the newest complete full run's kept visual rows — ${runsLine}`,
      composition: comp, ledger: ledgerInfo, baseline: baselineInfo, build: { now, gitHead: head }, freshRuns: fresh.map((c) => c.seal.sealId), incompleteRuns, unsealedStarts, notGraded } };
  }
  const verdicts = verdictIndex(L);
  const trust = { regs: registrationIndex(L), trusted: trustedOrchestratorKeys() };
  const r4 = round4Fails();
  const rulings = planRulings();
  const byRun = new Map(chrono.map((c) => [c.seal.sealId, new Map((c.rep.results || []).map((r) => [r.id, r]))]));
  const judgedRun = completeFull[0];                     // the judged frames: the newest COMPLETE full run
  const rows = [];
  for (const g of CARRIED) {
    // one observation per run that ran this row: every full run (a missing row there is `unrun`), and the
    // partial runs that selected it; oldest first
    const per = [];
    for (const c of chrono) {
      const r = byRun.get(c.seal.sealId).get(g.id);
      if (c.partial && !r) continue;
      per.push({ run: c, ...(await classifyRow(g, r, c, verdicts, c === judgedRun, trust)) });
    }
    const bRow = base.file.rows[g.id];
    const row = { id: g.id, kind: g.kind, owner: ownerOf(g), baseline: bRow.verdict, perRun: per.map((p) => p.cls),
      runs: per.map((p) => ({ run: p.run.seal.sealId, partial: p.run.partial || undefined, status: p.status, cls: p.cls, note: p.cls === 'pass' ? undefined : String(p.note || '').slice(0, 120) })) };
    const seen = per.filter((p) => p.cls !== 'infra');    // the observations of this row, oldest first
    if (R47_ROWS.includes(g.id) && !shadowedIds.has(g.id)) {
      // R47: staged on the Round-4 spear (replaced by the lance); graded on Brea with the lance at melee's W1 exit
      Object.assign(row, { cls: 'skipReplaced', owner: 'melee W1', ruling: 'R47', note: `SKIP-replaced (melee W1), R47: staged on the Round-4 spear, which CALIMA replaces with the lance; melee grades it on Brea with the lance at its W1 exit. Observed here: ${seen.map((p) => p.cls).join(' / ') || 'not run'}` });
    } else if (r33gShadowed(g)) {
      // R33 (g): graded by hero-body on Brea until its exit; observed here, never graded (and never counted as PASS)
      Object.assign(row, { cls: 'skipShadowed', shadowedBy: R33G.lane, note: `SKIP-shadowed(${R33G.lane}): R33 (g) — graded by ${R33G.lane} on Brea in W0b; A-carried-suite grades it on the merged build after ${R33G.lane}'s exit (CAL_SHADOW_EXITED=${R33G.lane}). Observed here: ${seen.map((p) => p.cls).join(' / ') || 'not run'}`,
        shot: g.kind === 'visual' ? (per.find((p) => p.run === judgedRun) || {}).shot : undefined });
    } else if (g.kind === 'visual') {
      const j = per.find((p) => p.run === judgedRun) || { cls: 'unrun', note: 'not in the judged run' };
      if (!KEPT_VISUAL.includes(g.id) && !shadowedIds.has(g.id)) {
        Object.assign(row, { cls: 'skipReplaced', note: `SKIP-replaced (R33 c): its subject is content scheduled for replacement; graded when ${row.owner} re-stages it on new content (shadows this id)`, shot: j.shot });
      } else {
        // graded on the newest complete full run's frame (the judges' frame); every other full run must have filmed it too
        Object.assign(row, { cls: j.cls, note: j.note, shot: j.shot, judge: j.judge });
        const fullSeen = seen.filter((p) => !p.run.partial);
        const older = fullSeen.filter((p) => p.run !== judgedRun && (p.cls === 'shotInvalid' || p.cls === 'unrun' || p.cls === 'fail'));
        if (older.length && !BAD_VISUAL.includes(row.cls)) { row.cls = 'shotInvalid'; row.note = 'an older graded run did not film this frame: ' + older.map((p) => p.note).join('; '); }
        row.flaky = new Set(fullSeen.filter((p) => p.cls !== 'filmedPruned').map((p) => (/^skip/.test(p.cls) ? 'skip' : 'staged'))).size > 1;
        if (row.flaky && !BAD_VISUAL.includes(row.cls)) { row.cls = 'stagingFlaky'; row.note = 'SKIP card in some runs, staged in others: ' + fullSeen.map((p) => p.cls).join(' / '); }
      }
    } else {
      const classes = seen.map((p) => p.cls);
      const expect = R27_FLAKY.includes(g.id) || bRow.verdict === 'flaky' ? 'flaky' : bRow.verdict === 'pass' ? 'pass' : 'listed';
      row.expect = expect;
      row.flaky = new Set(seen.map((p) => p.status)).size > 1;
      const hard = ['override', 'unrun'].find((b) => classes.includes(b));
      const isSkip = (c) => /^skip/.test(c);
      const mixedStaging = classes.some(isSkip) && classes.some((c) => !isSkip(c));
      const firstBad = (ok) => String((seen.find((p) => !ok(p.cls)) || {}).note || '').slice(0, 160);
      if (hard) { row.cls = hard; row.note = (seen.find((p) => p.cls === hard) || {}).note; }
      else if (!classes.length) { row.cls = 'unrun'; row.note = 'never observed on this build (every run that held it lost it to the harness)'; }
      else if (expect === 'pass') {
        // a Round-4-ATTRIBUTED PENDING (the box could not be measured: R26's loud box, a contended GPU) is not a
        // measurement of the row: it neither passes nor fails it; the row needs one measured PASS and no other result
        const measured = classes.filter((c) => c !== 'pendingAttributed' && c !== 'pendingQuietBox');
        if (!measured.length) { row.cls = 'needsQuietBox'; row.note = (classes.includes('pendingQuietBox') ? 'PASSED at baseline; every observation on this build reports PENDING-quiet-box (R45: its quiet-box term is graded at the orchestrator\'s quiet 5270 run) — ' : 'PASSED at baseline; every observation on this build is an attributed PENDING (box not measurable): re-run it on a quiet box — ') + firstBad((c) => c === 'pass'); }
        else if (measured.every((c) => c === 'pass')) { row.cls = 'pass'; if (measured.length < classes.length) row.note = `${classes.length - measured.length} attributed PENDING observation(s) not counted`; }
        else if (classes.every((c) => c === 'skipR30')) { row.cls = 'skipR30'; row.note = 'PASSED at baseline; its subject was deleted at W0a (R30) and it reports SKIP-legacy-deleted until the replacement lands: ' + firstBad((c) => c === 'pass'); }
        // W0b fix round 2: a row that passed at baseline ON LEGACY CONTENT and, re-staged under R28 ("any gate that would
        // stage a legacy kind reports SKIP-legacy, never PASS"), now reports SKIP-legacy (R28) in EVERY observation.
        // Plan §9 lists SKIP-legacy (R28) among the states A-carried-suite accepts; each such row is listed by name
        // (r28SinceBaseline) with its note, never counted as PASS. A FAIL in any observation is still a regression.
        else if (classes.every((c) => c === 'skipR28')) { row.cls = 'skipR28'; row.note = 'PASSED at baseline on legacy content; re-staged under R28 it reports SKIP-legacy (R28) until a staged kind can stand in: ' + firstBad((c) => c === 'pass'); }
        else { row.cls = mixedStaging ? 'stagingFlaky' : 'regression'; row.note = 'PASSED at baseline; now ' + classes.join(' / ') + ': ' + firstBad((c) => c === 'pass'); }
      } else if (expect === 'flaky') {
        const win = classes.filter((c) => c !== 'pendingAttributed' && c !== 'pendingQuietBox').slice(0, FLAKY_WINDOW), passes = win.filter((c) => c === 'pass').length, misses = win.length - passes;
        row.cls = passes >= FLAKY_PASSES ? 'pass' : misses > FLAKY_WINDOW - FLAKY_PASSES ? 'regression' : 'needsRuns';
        row.note = `known-flaky (${R27_FLAKY.includes(g.id) ? 'R27' : 'baseline ' + bRow.perRun.join('/')}): ${passes} pass of the first ${win.length} observation(s) on this build (${win.join(' / ')}); needs ${FLAKY_PASSES} of the first ${FLAKY_WINDOW}`
          + (row.cls === 'pass' ? '' : ': ' + firstBad((c) => c === 'pass').slice(0, 140));
      } else {
        const worstNow = classes.slice().sort((a, b) => RANK(a) - RANK(b))[0];
        row.current = worstNow;
        // W0b fix round 1 (judge finding: "self-granted newlyStaged exemption"): a row that was a SKIP at baseline and
        // now STAGES (R28: the Tiller fixture took the herd role) is graded like every other listed row — never worse
        // than its baseline. A FAIL or an unattributed PENDING on the newly staged content is WORSE than a named SKIP
        // (RANK), so it FAILs this gate with its owner named; no §8.3 ruling exempts it. It stays marked newlyStaged.
        row.newlyStaged = isSkip(bRow.verdict) && classes.some((c) => !isSkip(c));
        const worse = RANK(worstNow) < RANK(bRow.verdict);
        row.cls = mixedStaging && !worse ? 'stagingFlaky' : worse ? 'worseThanBaseline' : 'listed';
        row.note = `baseline ${bRow.verdict}${bRow.perRun ? ' (' + bRow.perRun.join('/') + ')' : ''}${row.newlyStaged ? ' (not staged then; staged now on the R28 fixture)' : ''}, now ${classes.join(' / ')}${worse ? ' — WORSE' : ''}: ` + String((seen.find((p) => p.cls === worstNow) || {}).note || '').slice(0, 140);
      }
    }
    if (r4[g.id]) row.round4 = r4[g.id];
    const short = /^(A\d+[a-z]?)(?:-|$)/.exec(g.id)?.[1];
    if (short && rulings[short]) row.planRulings = rulings[short];
    rows.push(row);
  }
  const tally = {};
  for (const r of rows) tally[r.cls] = (tally[r.cls] || 0) + 1;
  const isBad = (r) => (r.kind === 'visual' ? BAD_VISUAL : BAD_ACTION_R33).includes(r.cls);
  const bad = rows.filter(isBad);
  const checks = {
    composition: comp.ok,
    ledgerIntact: L.ok,
    baselineAnchored: base.ok,
    enoughCompleteFullRuns: completeFull.length >= MIN_FULL_RUNS,
    everyRunLoadedEveryFile: fresh.every((c) => (c.rep.loadFailures || []).length === 0),
    notAnOverrideRun: !(tally.override > 0),
    noActionRowRegressed: !bad.some((r) => r.kind !== 'visual'),
    keptVisualRowsJudgedPassOrSkipCard: !bad.some((r) => r.kind === 'visual'),
  };
  /*
   * W0b fix round 3 (R48 d): A-carried-suite is GRADED by the orchestrator on port 5270 after the W0b merges. In
   * gates-perf's lane run it reports PENDING-orchestrator and lists its offenders when every offender belongs to another
   * lane (RULED_OWNER: A90b -> instruments-core, R34) or is ruled (RULED_CLASS_OWNER: A9's quiet-box term, R45; V21's
   * R29 judge, R48 d) and every structural check holds; an offender this lane owns (a staging defect, a flaky staging,
   * a row that needs more runs, an unrun row, anything not named as another lane's) makes it FAIL.
   */
  const orchestratorRun = Number(PORT) === ORCHESTRATOR_PORT;
  // needsQuietBox is ruled (R45) only for a row whose observations carry the R45 label (A9's fps term); a row PENDING
  // for any other box reason stays this lane's (re-run it on a quiet box)
  const offenderOwner = (r) => (r.cls === 'needsQuietBox' ? ((r.perRun || []).includes('pendingQuietBox') ? RULED_CLASS_OWNER.needsQuietBox : null)
    : RULED_CLASS_OWNER[r.cls] || ((r.cls === 'regression' || r.cls === 'worseThanBaseline') && RULED_OWNER[r.id] ? RULED_OWNER[r.id] : null));
  const othersOffenders = bad.filter((r) => offenderOwner(r)), mineOffenders = bad.filter((r) => !offenderOwner(r));
  const structural = ['composition', 'ledgerIntact', 'baselineAnchored', 'enoughCompleteFullRuns', 'everyRunLoadedEveryFile', 'notAnOverrideRun'].every((k) => checks[k]);
  const allGreen = Object.values(checks).every(Boolean);
  const pass = allGreen ? true : (!orchestratorRun && structural && mineOffenders.length === 0) ? null : false;
  const count = (list) => Object.entries(list.reduce((a, r) => { a[r.cls] = (a[r.cls] || 0) + 1; return a; }, {})).map(([k, n]) => n + ' ' + k).join(', ');
  return { pass, detail: {
    verdict: (pass ? 'PASS' : pass === null
      ? `PENDING-orchestrator (R48 d): graded by the orchestrator on port ${ORCHESTRATOR_PORT} after the W0b merges; every offender here belongs to another lane or is ruled — ${othersOffenders.map((r) => r.id + ' [' + r.cls + '] -> ' + offenderOwner(r)).join('; ')}`
      : 'FAIL: ' + Object.keys(checks).filter((k) => !checks[k]).join(', ')
        + (bad.length ? ` — ${bad.length} row(s): ${count(bad)} (${bad.map((r) => r.id).slice(0, 14).join(', ')}${bad.length > 14 ? ', …' : ''})` : '')
        + (mineOffenders.length ? ` — this lane's: ${mineOffenders.map((r) => r.id + ' [' + r.cls + ']').join(', ')}` : ''))
      + ` — R33 regression guard vs the ${base.file.base} baseline (${base.anchor.split(':')[0]} anchor); observations: ${runsLine}`,
    mode: orchestratorRun ? `orchestrator run (port ${ORCHESTRATOR_PORT}): graded` : `lane run: PENDING-orchestrator when every offender is another lane's or ruled (R48 d)`,
    offendersThisLane: mineOffenders.map((r) => ({ id: r.id, cls: r.cls, note: String(r.note || '').slice(0, 200) })),
    offendersOtherLaneOrRuled: othersOffenders.map((r) => ({ id: r.id, cls: r.cls, owner: offenderOwner(r) })),
    r47SkipReplaced: rows.filter((r) => r.ruling === 'R47').map((r) => ({ id: r.id, owner: r.owner, observed: r.perRun })),
    r48aClauses: rows.filter((r) => r.id === 'A73-sample-bank').map((r) => ({ id: r.id, cls: r.cls, ruling: 'R48 (a): the per-kind machine-voice seed clause reports SKIP-replaced (audio W3, Instrument voices) inside the row; every other clause is graded', perRun: r.perRun })),
    checks, tally, composition: comp, ledger: ledgerInfo, baseline: baselineInfo,
    judgeTrust: { visualJudgePort: VISUAL_JUDGE_PORT, trustedOrchestratorKeys: [...trust.trusted].map(fingerprint),
      registrations: [...trust.regs.values()].flat().map((r) => ({ judge: r.judge, port: r.port, judgeKey: fingerprint(r.judgePub), by: fingerprint(r.orchestratorPub), sigOk: r.sigOk, trusted: trust.trusted.has(r.orchestratorPub) })) },
    incompleteRuns, unsealedStarts, judgedRun: judgedRun.seal.sealId,
    runs: chrono.map((c) => ({ sealId: c.seal.sealId, partial: c.partial, complete: c.complete, quietFraction: c.quietFraction == null ? null : +c.quietFraction.toFixed(3),
      louderThanBaseline: c.louderThanBaseline, port: c.seal.port, reportStamp: c.seal.reportStamp, startedAt: c.seal.startedAt, endedAt: c.seal.endedAt,
      load: c.seal.load, gitHead: c.seal.gitHead, build: c.seal.build.atEnd, carriedRows: c.seal.carriedRows, frames: Object.keys(c.seal.frames || {}).length,
      monitor: c.seal.monitor, concurrentSameTreeRuns: c.seal.concurrentSameTreeRuns })),
    build: { now, gitHead: head }, notGraded,
    // every offender names who fixes it (the §9 absorbing lane); there is NO exemption list here
    offenders: bad.map((r) => ({ id: r.id, cls: r.cls, baseline: r.baseline, perRun: r.perRun, owner: r.owner,
      ruling: r.cls === 'awaitingJudge' ? `orchestrator: an R29 judge on port ${VISUAL_JUDGE_PORT} (its key registered with --judge-register) grades ${r.shot} and signs the verdict with node tools/gates.r5.gates-perf.mjs --judge --seal ${judgedRun.seal.sealId} --id ${r.id} … --judge-key <its key>`
        : r.cls === 'judgeUnanchored' ? 'grade with CAL_ORCHESTRATOR_PUBKEY set to the orchestrator key that registered the judge (the grader trusts no key by default)'
        : r.cls === 'judgeInvalid' || r.cls === 'shotInvalid' ? 're-film (a fresh sealed full run) and re-judge'
        : r.cls === 'needsQuietBox' ? `re-run it on a quiet box (1-min load < 3, 0 other gate Chromes): node tools/gates.mjs --port ${PORT} --only ${r.id} (a sealed partial run), or the orchestrator's 5270 run`
        : r.cls === 'needsRuns' ? `re-run it (node tools/gates.mjs --port ${PORT} --only ${r.id}, sealed as a partial run) until its first ${FLAKY_WINDOW} observations on this build decide`
        : 'fix by ' + r.owner + ', or an orchestrator ruling recorded in the plan (no exemption in this gate)',
      ...(r.round4 ? { inheritedFromRound4: r.round4 } : {}), ...(r.planRulings ? { planRulings: r.planRulings } : {}),
      runs: r.runs, ...(r.shot ? { shot: r.shot } : {}), note: r.note })),
    listed: rows.filter((r) => r.cls === 'listed').map((r) => ({ id: r.id, owner: r.owner, baseline: r.baseline, now: r.current, perRun: r.perRun })),
    newlyStaged: rows.filter((r) => r.newlyStaged).map((r) => ({ id: r.id, cls: r.cls, owner: r.owner, baseline: r.baseline, now: r.current, perRun: r.perRun, note: r.note })),
    shadowed: { ruling: 'R33 (g)', lane: R33G.lane, exited: R33G_EXITED.has(R33G.lane), planHasR33g: /R33 \(g\)/.test(read(path.join(ROOT, 'docs', 'ROUND5-PLAN.md'))),
      rows: rows.filter((r) => r.cls === 'skipShadowed').map((r) => ({ id: r.id, observed: r.perRun, ...(r.shot ? { shot: r.shot } : {}) })) },
    knownFlaky: rows.filter((r) => r.expect === 'flaky').map((r) => ({ id: r.id, cls: r.cls, perRun: r.perRun, note: r.note })),
    r30SinceBaseline: rows.filter((r) => r.expect === 'pass' && r.cls === 'skipR30').map((r) => r.id),
    r28SinceBaseline: rows.filter((r) => r.expect === 'pass' && r.cls === 'skipR28').map((r) => ({ id: r.id, note: String(r.note || '').slice(0, 240) })),
    skipReplaced: rows.filter((r) => r.cls === 'skipReplaced').map((r) => r.id + ' -> ' + r.owner),
    skipped: rows.filter((r) => /^skip(?!Replaced)/.test(r.cls)).map((r) => r.id + ' [' + r.cls + ']'),
    judged: rows.filter((r) => r.judge).map((r) => ({ id: r.id, ...r.judge })),
  } };
}

/* ------------------------------------------------------------------------ */
/* R29 verdict CLI (not a gate)                                              */
/* ------------------------------------------------------------------------ */
/**
 *   node tools/gates.r5.gates-perf.mjs --judge-keygen --out <file.pem>
 *       an ed25519 key (orchestrator or judge); the private key is written 0600 OUTSIDE every worktree,
 *       the public key (base64 SPKI) and its fingerprint are printed
 *   node tools/gates.r5.gates-perf.mjs --judge-register --judge-name <who> --port <5271 | 5280-5299>
 *       --judge-pub <base64> --orchestrator-key <orchestrator.pem>
 *       the orchestrator registers one judge key for one (judge, port); appended to the ledger, signed
 *   node tools/gates.r5.gates-perf.mjs --judge --list [--port <run port>] [--seal <sealId>]
 *       the sealed carried runs of this tree (fresh or not, and why), the judge registrations, and for
 *       the newest fresh run (or --seal) every visual row: its frame IN THE LEDGER, sha256, criteria,
 *       reference, and whether it is a SKIP card, judged, or awaiting a verdict
 *   node tools/gates.r5.gates-perf.mjs --judge --seal <sealId> --id <V id> --pass true|false
 *       --rationale "<against the criteria and the reference>" --judge-name <who> --port <5271 | 5280-5299>
 *       --judge-key <judge.pem> [--reference reference/r5/...]
 *       appends the verdict, signed with the judge key, bound to the sealed frame's sha256
 */
function outsideTrees(p) {
  const realOf = (q) => { let cur = q; const rest = []; while (!existsSync(cur) && path.dirname(cur) !== cur) { rest.unshift(path.basename(cur)); cur = path.dirname(cur); } return path.join(realpathSync(cur), ...rest); };
  const real = realOf(path.resolve(p));
  const wt = spawnSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' });
  const trees = (wt.stdout || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => { try { return realpathSync(l.slice(9)); } catch { return null; } }).filter(Boolean);
  const inside = trees.find((t) => real === t || real.startsWith(t + path.sep)) || null;
  return { ok: !inside, real, insideTree: inside };
}
function loadPrivateKey(file, what) {
  if (!file) throw new Error(`${what}: pass the key file`);
  const o = outsideTrees(file);
  if (!o.ok) throw new Error(`${what}: ${o.real} lies inside the worktree ${o.insideTree}; keys live outside every tree`);
  const key = createPrivateKey(read(file));
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${what}: not an ed25519 key`);
  return key;
}

async function judgeCli() {
  const where = ledgerOutsideTrees();
  if (!where.ok) { console.error(`[judge] the ledger ${where.ledger} lies inside the worktree ${where.insideTree}; set CAL_GATE_LEDGER outside every tree`); return 2; }
  if (process.argv.includes('--judge-keygen')) {
    const out = argFlag('--out', null);
    if (!out) { console.error('[judge] --judge-keygen --out <file.pem>'); return 2; }
    const o = outsideTrees(out);
    if (!o.ok) { console.error(`[judge] ${o.real} lies inside the worktree ${o.insideTree}; write keys outside every tree`); return 2; }
    if (existsSync(out)) { console.error(`[judge] ${out} exists; refusing to overwrite a key`); return 2; }
    const { privateKey } = generateKeyPairSync('ed25519');
    mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    writeFileSync(out, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const pub = b64Pub(privateKey);
    console.log(`private key: ${path.resolve(out)} (0600)\npublic key:  ${pub}\nfingerprint: ${fingerprint(pub)}`);
    return 0;
  }
  const L = readLedger();
  if (!L.ok) { console.error(`[judge] the ledger ${L.file} is broken at line ${L.brokenAt}: ${L.why}`); return 2; }
  if (process.argv.includes('--judge-register')) {
    const judge = String(argFlag('--judge-name', '') || '').trim(), port = Number(argFlag('--port', NaN)), judgePub = String(argFlag('--judge-pub', '') || '').trim();
    let okey;
    try { okey = loadPrivateKey(argFlag('--orchestrator-key', null), '--orchestrator-key'); } catch (e) { console.error('[judge] ' + e.message); return 2; }
    if (!judge) { console.error('[judge] --judge-name <who>'); return 2; }
    if (!JUDGE_PORT_OK(port)) { console.error(`[judge] --port ${port} is not a judge port (5271, 5280-5299)`); return 2; }
    try { createPublicKey({ key: Buffer.from(judgePub, 'base64'), format: 'der', type: 'spki' }); } catch { console.error('[judge] --judge-pub is not a base64 SPKI public key (print it with --judge-keygen)'); return 2; }
    const orchestratorPub = b64Pub(okey);
    if (orchestratorPub === judgePub) { console.error('[judge] the orchestrator key cannot register itself as a judge'); return 2; }
    const r = { kind: 'judge-registered', at: new Date().toISOString(), judge, port, judgePub, orchestratorPub };
    r.sig = cryptoSign(null, Buffer.from(regMessage(r)), okey).toString('base64');
    r.writer = { pid: process.pid, ppid: process.ppid, cwd: process.cwd() };
    appendLedger(r);
    console.log(`[judge] registered judge "${judge}" on port ${port}: key ${fingerprint(judgePub)}, by orchestrator key ${fingerprint(orchestratorPub)}`);
    return 0;
  }
  const cfg = await import('./gates.config.mjs');
  const now = buildFingerprint(shadowFilesOf(cfg));
  const head = gitHead();
  const portArg = argFlag('--port', null);
  const sealArg = argFlag('--seal', null);
  const regs = registrationIndex(L), trusted = trustedOrchestratorKeys();
  if (process.argv.includes('--list')) {
    const all = sealsOfTree(L, { port: sealArg ? null : portArg }, now, head);
    console.log(`ledger ${L.file} (${L.entries.length} entries, chain intact)`);
    const incomplete = (c) => (c.rep?.results || []).filter((r) => CARRIED_IDS.has(r.id) && isInfraResult(r)).length;
    let floor = 0;
    try { const bf = JSON.parse(read(BASELINE_FILE)); floor = Math.min(...bf.runs.map((r) => (r.box && r.monitorSamples ? r.box.quietSamples / r.monitorSamples : 1))); } catch { floor = 0; }
    const quiet = (c) => (c.seal.monitor?.samples ? (c.seal.monitor.box?.quietSamples || 0) / c.seal.monitor.samples : null);
    const loud = (c) => !(quiet(c) != null && quiet(c) >= floor - 1e-9);
    for (const c of all.slice(0, 12)) console.log(`  ${c.why.length ? 'not gradable' : incomplete(c) ? 'INCOMPLETE ' : 'FRESH      '} ${c.seal.partial ? 'partial' : 'FULL   '} ${c.seal.sealId}  port ${c.seal.port}  ${c.seal.reportStamp}  quiet ${quiet(c) == null ? '?' : (quiet(c) * 100).toFixed(0) + ' %'}${!c.why.length && loud(c) ? ' (louder than the baseline box)' : ''}  ${c.why.join('; ')}${!c.why.length && incomplete(c) ? incomplete(c) + ' row(s) not observed by the harness: never the judged run' : ''}`);
    console.log(`judge registrations: ${[...regs.values()].flat().map((r) => `${r.judge}@${r.port} key ${fingerprint(r.judgePub)} by ${fingerprint(r.orchestratorPub)}${r.sigOk ? '' : ' (BAD SIGNATURE)'}`).join('; ') || 'none'}`);
    console.log(`trusted orchestrator keys (CAL_ORCHESTRATOR_PUBKEY): ${[...trusted].map(fingerprint).join(', ') || 'none'}`);
    const pick = sealArg ? all.find((c) => c.seal.sealId === sealArg) : all.find((c) => !c.why.length && !incomplete(c) && c.seal.partial !== true);
    if (!pick || !pick.rep) { console.log('no fresh, complete, sealed FULL carried run to judge'); return 0; }
    const verdicts = verdictIndex(L);
    console.log(`\nvisual rows of ${pick.seal.sealId} (judge port must not be ${pick.seal.port}):`);
    const byId = new Map((pick.rep.results || []).map((r) => [r.id, r]));
    for (const g of CARRIED.filter((x) => x.kind === 'visual')) {
      const c = await classifyRow(g, byId.get(g.id), pick, verdicts, true, { regs, trusted });
      const crit = Array.isArray(g.criteria) ? g.criteria.join(' / ') : String(g.criteria || '');
      console.log(`\n${g.id}  [${c.cls}]  ${c.shot || ''}\n  sha256 ${pick.seal.frames?.[g.id] || '-'}  captured ${pick.seal.framesCapture?.[g.id]?.at || '-'}\n  reference: ${g.reference || '(none named)'}\n  criteria: ${crit}`);
    }
    return 0;
  }
  const id = argFlag('--id', null), port = Number(portArg), passRaw = argFlag('--pass', null);
  const pick = L.entries.find((e) => e.entry.kind === 'seal' && e.entry.sealId === sealArg)?.entry;
  if (!pick) { console.error(`[judge] --seal ${sealArg}: no such sealed run in ${L.file}`); return 2; }
  if (pick.tree !== realpathSync(ROOT)) { console.error(`[judge] ${sealArg} is a run of ${pick.tree}, not of this tree`); return 2; }
  const g = CARRIED.find((x) => x.id === id && x.kind === 'visual');
  if (!g) { console.error(`[judge] --id ${id}: not a visual carried row`); return 2; }
  if (passRaw !== 'true' && passRaw !== 'false') { console.error('[judge] --pass true|false'); return 2; }
  const frame = path.join(LEDGER_RUNS, sealArg, id + '.png');
  if (!pick.frames?.[id] || !existsSync(frame) || sha256(readFileSync(frame)) !== pick.frames[id]) { console.error(`[judge] ${id}: ${sealArg} holds no intact sealed frame for it`); return 2; }
  let jkey;
  try { jkey = loadPrivateKey(argFlag('--judge-key', null), '--judge-key'); } catch (e) { console.error('[judge] ' + e.message + ' (fix round 3: every verdict is signed with a registered judge key)'); return 2; }
  const v = { kind: 'verdict', at: new Date().toISOString(), sealId: sealArg, id, frameSha256: pick.frames[id], pass: passRaw === 'true',
    rationale: String(argFlag('--rationale', '')), judge: String(argFlag('--judge-name', '')), port, reference: argFlag('--reference', null),
    judgePub: b64Pub(jkey) };
  v.sig = cryptoSign(null, Buffer.from(verdictMessage(v)), jkey).toString('base64');
  v.writer = { pid: process.pid, ppid: process.ppid, cwd: process.cwd() };
  const jf = judgeFacts({ ...v, seq: Infinity }, pick, id, regs, trusted);
  if (!jf.ok && !jf.unanchored) { console.error(`[judge] ${id}: ${jf.why.join('; ')}`); return 2; }
  appendLedger(v);
  console.log(`[judge] ${id}: ${v.pass ? 'PASS' : 'FAIL'} recorded for ${sealArg} (frame ${pick.frames[id].slice(0, 12)}, judge key ${fingerprint(v.judgePub)}, registered by ${jf.registeredBy.join(', ')}) in ${L.file}`
    + (jf.unanchored ? `\n[judge] note: this shell trusts no orchestrator key that registered it (CAL_ORCHESTRATOR_PUBKEY); the grader decides` : ''));
  return 0;
}
/* ------------------------------------------------------------------------ */
/* the gates                                                                 */
/* ------------------------------------------------------------------------ */
export const GATES = [
  {
    id: 'A-gate-preludes', kind: 'runner', lane: LANE, timeout: 60000,
    title: 'W0a: 0 Round-4 species literals and 0 old-map coordinates (W0 table, REST, Round-4 placements and legs; as calls, arrays, objects, URLs, declared pairs or hypot offsets) in tools/gates*.mjs (+ budgets.mjs); the DIES set is gone; every carried row that stages by role / place / hero bone carries that prelude; every machines.list use in a carried row or in this lane\'s staging sources is a roster helper, a KIND/STAGED_KINDS filter or an annotated whole-roster operation (R28); no carried or visual row names HZD/HFW/Horizon Zero/Nora/the old hero name or a non-r5 reference still',
    check: ({ GATES: ALL }) => gatePreludes(ALL),
  },
  {
    id: 'A-gates-no-hero-literals', kind: 'runner', lane: LANE, timeout: 60000,
    title: 'W0a: 0 matches of the old rig\'s bone / chain / name literals in tools/gate*.mjs; gates read animator.b.* and animator.chainOf()',
    check: ({ GATES: ALL }) => noHeroLiterals(ALL),
  },
  {
    id: 'A-gates-autodiscover', kind: 'runner', lane: LANE, timeout: 90000,
    title: 'W0a: gates.config.mjs imports every tools/gates.r5.*.mjs by pattern — a new lane file needs no config edit, a lane row shadows a carried row by id, and a broken lane file becomes a FAIL row',
    check: () => autodiscover(),
  },
  {
    id: 'A-chrome-semaphore', kind: 'runner', lane: LANE, timeout: 900000,   // four real gate runs in sequence at 1 slot: 7 min was not enough at load 70 (fix round 3)
    title: 'W0a: 4 gate runs at once never exceed the machine-wide Chrome slots (2 by default) at 100 ms samples; slots are released on exit and on SIGKILL; the preflight refuses Chrome at < 3 GB free disk or < 25 % memory_pressure free',
    check: (ctx) => chromeSemaphore(ctx),
  },
  {
    id: 'A-carried-suite', kind: 'runner', lane: LANE, timeout: 180000,
    title: "W0a (R33): gates.r5.carried.mjs holds every CARRY + RESTAGE gate of Appendix B (DIES gone) and is a REGRESSION GUARD against the anchored W0-day1 baseline over every sealed observation of this build (>= 1 complete full run + targeted partial re-runs; run ledger outside the tree): a row that PASSED at baseline PASSes (R30 SKIP allowed), known-flaky rows PASS 3 of their first 5 observations, FAIL/PENDING rows never get worse; the kept visual rows (V1-V4, V12-V14, V21) are signed R29 PASSes on the newest full run's frames, every other visual row SKIP-replaced",
    check: (ctx) => carriedSuite(ctx),
  },
  // W0b rows (tools/gates/gates-perf.w0b.mjs): the licence-clean reference set and the memory / draw ledgers
  ...W0B_GATES,
  // LAST in the block (fix round 3): its lsof half grades this invocation's own run monitor from process
  // start to the moment it runs, so every other row of the block (A-chrome-semaphore's child runs too) is inside
  {
    id: 'A-port-guard', kind: 'runner', lane: LANE, timeout: 240000,
    title: 'W0a: gates.mjs and screenshot.mjs refuse no-port / 5173 / out-of-range ports (exit != 0, before any socket or child), accept 5250-5271 and 5280-5299, and the run monitors show 0 connections to :5173 from any process of this lane run or of the sealed carried runs it vouches for, gap-free',
    check: (ctx) => portGuard(ctx),
  },
];

/* ------------------------------------------------------------------------ */
/* R48 (b): the sealed W0b instrument observations, verified                  */
/* ------------------------------------------------------------------------ */
/**
 * node tools/gates.r5.gates-perf.mjs --instruments [--port <run port>] [--json]
 * Every seal of THIS tree (and port) that executed an R48 (b) instrument row, newest first, each VERIFIED: the ledger
 * chain intact, the report copy hashing to the seal, the monitor copy hashing to the seal, the report carrying the
 * seal's run id, the build unchanged during the run and whether it is the current build; then each instrument row's
 * status, its instrument verdict (detail.instrument), its bars (detail.bars, with `binding`) and its run id. Exit 0
 * when the newest fresh seal holds all three rows with every instrument check true; 1 otherwise.
 */
async function instrumentsCli() {
  const port = argFlag('--port', null);
  const L = readLedger();
  if (!L.ok) { console.error(`[instruments] ledger ${L.file} broken at line ${L.brokenAt}: ${L.why}`); return 1; }
  const cfg = await import('./gates.config.mjs');
  const now = buildFingerprint(shadowFilesOf(cfg));
  const all = sealsOfTree(L, { port: port == null ? null : Number(port) }, now, gitHead()).filter((c) => (c.seal.instrumentRows || []).length);
  const out = all.map((c) => {
    const rows = {};
    for (const id of c.seal.instrumentRows) {
      const r = (c.rep?.results || []).find((x) => x.id === id);
      const d = r?.detail || {};
      rows[id] = { status: r?.status ?? null, instrument: d.instrument || null, instrumentOk: d.instrument ? Object.values(d.instrument).every(Boolean) : false,
        bars: d.bars ? Object.fromEntries(Object.entries(d.bars).map(([k, b]) => [k, { binding: b.binding, pass: b.pass }])) : null, runId: d.runId || null,
        runIdMatchesSeal: d.runId ? d.runId === c.seal.runId || d.runId === c.seal.sealId : null, verdict: String(d.verdict || r?.error || '').slice(0, 220) };
    }
    const srcNow = INSTRUMENT_SOURCES.map((f) => { try { return sha256(readFileSync(path.join(TOOLS, f))); } catch { return null; } });
    const srcWhy = !c.seal.instrumentSource ? ['the seal records no instrument source (sealed before fix round 3)']
      : c.seal.instrumentSource.map((x, i) => (x.sha256 === srcNow[i] ? null : x.file + ' changed since the run')).filter(Boolean);
    const why = [...c.why, ...srcWhy];
    return { sealId: c.seal.sealId, startedAt: c.seal.startedAt, endedAt: c.seal.endedAt, scope: c.seal.scope || null, port: c.seal.port, argv: c.seal.argv,
      fresh: why.length === 0, why, tampered: c.tampered || null, reportRunId: c.rep?.runId || null, reportSha256: c.seal.reportSha256,
      monitor: c.seal.monitor ? { samples: c.seal.monitor.samples, maxGapMs: c.seal.monitor.maxGapMs, box: c.seal.monitor.box } : null, load: c.seal.load, gitHead: c.seal.gitHead, rows };
  });
  const newest = out.find((x) => x.fresh && !x.tampered);
  const ok = !!newest && INSTRUMENT_IDS.size === Object.keys(newest.rows).filter((id) => INSTRUMENT_IDS.has(id)).length
    && Object.values(newest.rows).every((r) => r.instrumentOk && r.runIdMatchesSeal !== false);
  if (process.argv.includes('--json')) console.log(JSON.stringify({ ledger: L.file, ok, newestFresh: newest?.sealId || null, seals: out }, null, 1));
  else {
    console.log(`[instruments] ledger ${L.file} (chain intact, ${L.entries.length} entries); ${out.length} sealed instrument run(s) of this tree${port ? ' on port ' + port : ''}`);
    for (const x of out) {
      console.log(`  ${x.sealId}  ${x.startedAt} -> ${x.endedAt}  ${x.fresh ? 'FRESH (current build)' : 'stale: ' + x.why.join('; ').slice(0, 120)}${x.tampered ? '  TAMPERED: ' + x.tampered : ''}  report runId ${x.reportRunId}  box load max ${x.monitor?.box?.loadMax}, other gate Chromes max ${x.monitor?.box?.otherGateChromesMax}`);
      for (const [id, r] of Object.entries(x.rows)) console.log(`    ${id.padEnd(14)} ${String(r.status).padEnd(8)} instrument ${r.instrumentOk ? 'PASS' : 'FAIL'}  bars ${r.bars ? Object.entries(r.bars).map(([k, b]) => k + (b.binding ? '' : '*') + '=' + (b.pass === null ? 'PENDING' : b.pass ? 'pass' : 'FAIL')).join(' ') : '-'}  runId ${r.runIdMatchesSeal === false ? 'MISMATCH' : 'bound'}`);
    }
    console.log(`[instruments] ${ok ? 'OK' : 'NOT OK'}: newest fresh seal ${newest?.sealId || 'none'} (* = bar not binding in that run, R48 b)`);
  }
  return ok ? 0 : 1;
}

/* ------------------------------------------------------------------------ */
/* CLI                                                                       */
/* ------------------------------------------------------------------------ */
/* Run AFTER this module has finished evaluating: the --judge CLI imports gates.config.mjs, which
 * imports this file, and a top-level await on that import here would wait on itself. */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  setImmediate(async () => {
    if (process.argv.includes('--carried-baseline')) process.exit(await baselineCli());
    if (process.argv.includes('--instruments')) process.exit(await instrumentsCli());
    if (process.argv.includes('--judge') || process.argv.includes('--judge-keygen') || process.argv.includes('--judge-register')) process.exit(await judgeCli());
    const i = process.argv.indexOf('--watch-5173');
    if (i < 0) {
      console.error('usage: node tools/gates.r5.gates-perf.mjs --watch-5173 <out.json> [--seconds N]\n'
        + '       node tools/gates.r5.gates-perf.mjs --judge --list [--port <run port>] [--seal <sealId>]\n'
        + '       node tools/gates.r5.gates-perf.mjs --instruments [--port <run port>] [--json]   (R48 b: the sealed W0b instrument runs, verified)\n'
        + '       node tools/gates.r5.gates-perf.mjs --judge-keygen --out <file.pem outside every tree>\n'
        + '       node tools/gates.r5.gates-perf.mjs --judge-register --judge-name <who> --port <5271|5280-5299> --judge-pub <base64> --orchestrator-key <orchestrator.pem>\n'
        + '       node tools/gates.r5.gates-perf.mjs --judge --seal <sealId> --id <V id> --pass true|false --rationale <text> --judge-name <who> --port <5271|5280-5299> --judge-key <judge.pem> [--reference <file>]');
      process.exit(2);
    }
    const outFile = path.resolve(process.argv[i + 1] || path.join(ROOT, 'shots', 'gates', 'port5173-watch.json'));
    const s = process.argv.indexOf('--seconds');
    await watch5173(outFile, s > 0 ? Number(process.argv[s + 1]) : 0);
  });
}
