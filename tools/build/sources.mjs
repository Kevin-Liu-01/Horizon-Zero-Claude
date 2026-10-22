/**
 * CALIMA third-party SOURCE staging (pipeline lane, W0b; plan §2 row, §4.6,
 * §10.1, gate A-sources-staged).
 *
 * The deterministic asset build reads third-party material ONLY from
 * `models-staging/r5-src/` (git-ignored; the orchestrator symlinks it into
 * each lane worktree). Each source archive gets one directory, holding only the
 * files a recipe reads:
 *
 *   models-staging/r5-src/<dir>/<path inside the archive, prefix stripped>
 *
 * `<dir>` is the lock entry's `dir` (default: the LICENSES.json row id). The
 * four human sources keep the Round-5 proof's short layout, which hero-body's
 * recipes (`tools/build/recipes/lib/face.mjs` srcRoot) read verbatim (W0b fix
 * round 1; the row-id layout broke them):
 *
 *   row ubc-standard          -> r5-src/ubc/   (Base Characters/…, Hairstyles/…)
 *   row mco-fantasy-standard  -> r5-src/mco/   (Modular Parts/…)
 *   row ual2-standard         -> r5-src/ual2/  (UAL2_Standard.glb, …)
 *   row ual1                  -> r5-src/ual1/  (the shipped UAL v1 Godot export)
 *
 * Consumers resolve a directory with `sourceDir(rowId)` (never by joining a row
 * id), and one entry per source sits in the TRACKED lock
 * `tools/build/sources.lock.json`:
 *
 *   { row, dir, archive: { name, bytes, sha256, retrieved, page }, strip, files: { <rel>: { bytes, sha256 } }, totalBytes }
 *
 * The archive SHA-256 is recorded in BOTH the lock and the row's
 * `archive_sha256` (public/LICENSES.json); A-sources-staged requires them equal.
 *
 * COMMANDS (any lane stages its sources through this tool, as rows go through
 * tools/licences/add.mjs):
 *
 *   node tools/build/sources.mjs stage-zip  --row <id> --zip <archive.zip> --keep '<glob>' [--keep ...] [--dir <name>]
 *                                          [--strip <member prefix>] [--retrieved YYYY-MM-DD] [--page <url>] [--delete-zip]
 *       hash the archive (streamed), extract only the kept members into r5-src/<dir>/, write the lock
 *       entry and the row's archive_sha256 / archive_bytes / retrieved; --delete-zip removes the archive
 *   node tools/build/sources.mjs stage-dir  --row <id> --from <dir> [--keep '<glob>' ...] [--move] [--dir <name>]
 *                                          --archive-name <file> --archive-bytes <n> --retrieved YYYY-MM-DD [--page <url>]
 *       stage files already extracted (e.g. the Round-5 proof's scratch copies) WITHOUT the archive:
 *       the lock records per-file SHA-256s and `archive.sha256: null` until `verify-zip`
 *   node tools/build/sources.mjs verify-zip --row <id> --zip <archive.zip> [--retrieved YYYY-MM-DD] [--delete-zip]
 *       prove a staged directory came from THIS archive: every staged file must equal its member byte for
 *       byte (inflated and SHA-256-compared; the member is found by path suffix). On success the archive
 *       SHA-256 is recorded in the lock and the row; on any mismatch nothing is recorded (the pack changed:
 *       re-stage with stage-zip)
 *   node tools/build/sources.mjs stage-files --row <id> [--dir <name>]
 *       a source with NO archive (Google Fonts serves one file per subset): the row lists its downloads in
 *       `files: [{ path, source_url, sha256, bytes }]` and records `archive_sha256` = SHA-256 of the
 *       sorted `sha256sum` manifest of those files (`<sha256>  <basename>\n` lines; brand's font rows).
 *       Each listed file (shipped unmodified under public/) is verified against its sha256 and cloned
 *       into r5-src/<dir>/; the manifest hash must equal the row's archive_sha256, and is recorded
 *   node tools/build/sources.mjs restore --row <id> (--from <dir> | --zip <archive.zip>) [--retrieved YYYY-MM-DD] [--delete-zip]
 *       put the lock's files back byte for byte after r5-src was lost (fresh worktree, reboot): every lock file is
 *       found in the dir / archive and verified against its lock SHA-256 before anything is written (all or
 *       nothing; the lock's file list never changes). --zip also checks (or, when none is recorded yet, records)
 *       the archive SHA-256 — the W0b re-fetch in one command per archive
 *   node tools/build/sources.mjs record-per-file --row <id>
 *       ONLY under the ruling <!-- r5-ruling archive-per-file-<row>=accepted --> (a version whose archive can no longer
 *       be fetched, UAL1): record the per-file SHA-256 manifest of the staged files as the row's hash, stage-files form
 *   node tools/build/sources.mjs status [--json]      the A-sources-staged report
 *   node tools/build/sources.mjs layout               row id -> directory, one JSON line (the published layout)
 *
 * ARCHIVE IDENTITY (W0b fix round 3; judge: "restore --zip and verify-zip record any zip's hash as the upstream
 * archive's, so a self-made zip passes the gates"). Matching the staged files proves only that a zip CONTAINS them;
 * a re-zip of the trimmed subset contains them too. So restore --zip, verify-zip and stage-zip on a known source
 * refuse an archive, before anything is written or recorded, unless ALL of these hold (`archiveIdentity`):
 *   - its file name equals the lock's `archive.name`, which equals the row's `archive_name` (a browser copy
 *     "… (1).zip" is renamed back by hand; a source with no recorded name cannot be re-fetched);
 *   - its byte size equals the recorded `archive.bytes` (= the row's `archive_bytes`; plan §10.1 kept the UBC and MCO
 *     sizes for exactly this). A source with NO recorded size (UAL2, UAL1) needs the orchestrator ruling
 *     `<!-- r5-ruling archive-size-<row>=first-fetch -->` in docs/ROUND5-PLAN.md §8.3, and then its size must still
 *     fall inside the lock's `approxBytes` window when one is recorded (UAL2: the proof's "zip 17 MB");
 *   - it holds members BEYOND the staged subset (a zip of exactly the trimmed files is a re-zip, not the pack);
 *   - once recorded, its member count and listing SHA-256 equal the recorded ones.
 * The name and size are never taken from the zip. On success the lock records `archive.members`,
 * `archive.listingSha256` and the listing itself (`tools/build/sources.listings/<row>.tsv`, one
 * `<size>\t<crc32>\t<name>` line per member), so the record can be audited against the upstream pack later.
 * status() (A-sources-staged) and tools/licences/check.mjs (third-party) FAIL when the lock's archive name, size or
 * SHA-256 disagree with the LICENSES.json row, or when a recorded hash lacks its size / member listing.
 * The negative controls (re-zipped subset, size-matched re-zip, wrong name, unknown size without a ruling, one
 * changed member; plus the positive control) run in scratch inside the A-sources-staged gate.
 *
 * No network access anywhere in this file: archives are downloaded by a
 * person (itch.io's free "No thanks, just take me to the downloads" flow has
 * no stable URL), then handed to stage-zip / verify-zip.
 */
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync, copyFileSync, renameSync,
  rmSync, realpathSync, constants as FS,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openZip, sha256File } from './lib/zip.mjs';
import { cloneFile } from './lib/clone.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const LOCK = 'tools/build/sources.lock.json';
export const SRC_REL = 'models-staging/r5-src';
export const CAP_BYTES = 150 * 1024 * 1024;          // plan §9 A-sources-staged: <= 150 MB
/** The sources the plan names for the W0b exit (§9 A-sources-staged): UBC, MCO, UAL1, UAL2 (+ scan and font rows, below). */
export const REQUIRED = ['ubc-standard', 'mco-fantasy-standard', 'ual1', 'ual2-standard'];
/** The published directory of each required source (the lock's `dir`; a new row defaults to its id). */
export const DIRS = { 'ubc-standard': 'ubc', 'mco-fantasy-standard': 'mco', ual1: 'ual1', 'ual2-standard': 'ual2' };

/** The orchestrator's plan (§8.3 rulings are `<!-- r5-ruling key=value -->` lines, the form engine-gpu's gates read). */
export const PLAN = 'docs/ROUND5-PLAN.md';
/** Tracked member listings of the recorded archives: `<LISTINGS>/<row>.tsv`. */
export const LISTINGS = 'tools/build/sources.listings';

export const srcDir = (root = ROOT, env = process.env) => (env.R5_SRC ? path.resolve(env.R5_SRC) : path.join(root, SRC_REL));
/** The directory of one staged source row: `<srcDir>/<lock dir | DIRS | row id>`. */
export function sourceDir(row, { root = ROOT, env = process.env, lock = null } = {}) {
  const ent = (lock || loadLock(root)).sources?.[row];
  return path.join(srcDir(root, env), ent?.dir || DIRS[row] || row);
}
/** row id -> directory name for every lock entry (the `layout` command). */
export function layout(root = ROOT) {
  const lock = loadLock(root);
  return Object.fromEntries(Object.entries(lock.sources).map(([id, e]) => [id, `${SRC_REL}/${e.dir || DIRS[id] || id}`]));
}
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const posix = (p) => p.split(path.sep).join('/');

export function loadLock(root = ROOT) {
  const f = path.join(root, LOCK);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { schema: 1, about: '', sources: {} };
}
function saveLock(lock, root = ROOT) {
  const sorted = {};
  for (const k of Object.keys(lock.sources).sort()) {
    const s = lock.sources[k];
    const files = {};
    for (const f of Object.keys(s.files).sort()) files[f] = s.files[f];
    sorted[k] = { ...s, files };
  }
  writeFileSync(path.join(root, LOCK), `${JSON.stringify({ ...lock, sources: sorted }, null, 2)}\n`);
}

/** Glob -> RegExp over posix paths: `*` one segment, `**` any depth, `?`, `{a,b}`. */
export function globRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); re += `(?:${glob.slice(i + 1, end).split(',').map((s) => s.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = end; } else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
const kept = (rel, keeps) => !keeps.length || keeps.some((g) => globRe(g).test(rel));

function walkFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === '.DS_Store') continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walkFiles(abs, base, out); else out.push(posix(path.relative(base, abs)));
  }
  return out;
}
function duBytes(dir) {
  if (!existsSync(dir)) return 0;
  return walkFiles(dir).reduce((n, f) => n + statSync(path.join(dir, f)).size, 0);
}

async function updateRow(rowId, patch, root = ROOT) {
  const { upsert } = await import('../licences/add.mjs');
  const { loadManifest } = await import('../licences/lib.mjs');
  const m = loadManifest(root);
  const row = m?.rows.find((r) => r.id === rowId);
  if (!row) throw new Error(`no LICENSES.json row "${rowId}" — add it first with tools/licences/add.mjs`);
  const next = { ...row, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
  upsert([next], { root });
  return next;
}

/**
 * Do a LICENSES.json source row and its lock entry name the same upstream archive, and is a recorded hash tied to it?
 * Pure apart from reading the listing file under `root` (pass `root: null` to skip that term). [] = they agree.
 * Used by status() (A-sources-staged) and tools/licences/check.mjs (A-licence-manifest third-party), so a hand-edited
 * or re-zipped record FAILs both gates.
 */
export function archiveAgreement(licRow, ent, { root = ROOT } = {}) {
  const a = ent?.archive || {};
  const out = [];
  if ((licRow?.archive_sha256 ?? null) !== (a.sha256 ?? null)) out.push(`archive SHA-256: LICENSES.json ${String(licRow?.archive_sha256 ?? null).slice(0, 12)} != lock ${String(a.sha256 ?? null).slice(0, 12)}`);
  if (a.kind === 'file-manifest') return out;                       // stage-files: the hash is the per-file manifest's
  if ((licRow?.archive_name ?? null) !== (a.name ?? null)) out.push(`archive name: LICENSES.json "${licRow?.archive_name ?? null}" != lock "${a.name ?? null}"`);
  if ((licRow?.archive_bytes ?? null) !== (a.bytes ?? null)) out.push(`archive size: LICENSES.json ${licRow?.archive_bytes ?? null} != lock ${a.bytes ?? null}`);
  if (a.sha256) {
    const why = [];
    if (a.bytes == null) why.push('no byte size');
    const n = Object.keys(ent.files || {}).length;
    if (!(a.members > n)) why.push(`member count ${a.members ?? 'not recorded'} is not beyond the ${n} staged files`);
    if (!a.listingSha256) why.push('no member listing hash');
    else if (root) {
      const lf = path.join(root, LISTINGS, `${ent.row}.tsv`);
      if (!existsSync(lf)) why.push(`no member listing ${LISTINGS}/${ent.row}.tsv`);
      else if (sha(readFileSync(lf)) !== a.listingSha256) why.push(`${LISTINGS}/${ent.row}.tsv does not hash to the recorded listingSha256`);
    }
    if (why.length) out.push(`the recorded archive SHA-256 is not tied to the upstream archive (${why.join('; ')}): record it with restore --zip / verify-zip`);
  }
  return out;
}

/** `<!-- r5-ruling key=value -->` lines of docs/ROUND5-PLAN.md (each on its own line), as { key: value }. */
export function rulings(root = ROOT) {
  const f = path.join(root, PLAN);
  const out = {};
  if (!existsSync(f)) return out;
  for (const m of readFileSync(f, 'utf8').matchAll(/^[ \t]*<!--\s*r5-ruling\s+([a-z0-9][a-z0-9-]*)\s*=\s*([A-Za-z0-9._-]+)\s*-->[ \t]*$/gm)) out[m[1]] = m[2];
  return out;
}

const junkMember = (e) => e.dir || e.name.startsWith('__MACOSX/') || /(^|\/)\.DS_Store$/.test(e.name);
/** The member listing of an archive: sorted `<size>\t<crc32>\t<name>` lines (directories and __MACOSX/.DS_Store excluded). */
export function memberListing(entries) {
  const lines = entries.filter((e) => !junkMember(e)).map((e) => `${e.size}\t${(e.crc32 >>> 0).toString(16).padStart(8, '0')}\t${e.name}`).sort();
  const text = lines.length ? `${lines.join('\n')}\n` : '';
  return { members: lines.length, text, sha256: sha(Buffer.from(text)) };
}

/** The unique member of `members` a lock file `rel` comes from (exact path, else the one ending in `/<rel>`). */
const memberFor = (members, rel) => {
  const exact = members.filter((e) => e.name === rel);
  return exact.length ? exact : members.filter((e) => e.name.endsWith(`/${rel}`));
};

/**
 * Is this zip the upstream archive the lock entry names? (see ARCHIVE IDENTITY in the header). Pure: returns the
 * problems ([] = accepted) plus what would be recorded. `mode`: 'refetch' (restore / verify-zip: the staged files
 * are a subset of it) or 'restage' (stage-zip over a known source).
 */
export function archiveIdentity({ row, ent, licRow, zipName, bytes, entries, rulingMap = {}, mode = 'refetch' }) {
  const problems = [];
  const a = ent?.archive || {};
  const sizeRuling = rulingMap[`archive-size-${row}`] === 'first-fetch';
  const newVersion = rulingMap[`archive-new-version-${row}`] === 'accepted';
  if (!a.name) problems.push(`no archive name is recorded for ${row} in ${LOCK}: record the expected file name (and byte size) before a fetch`);
  else if (zipName !== a.name) problems.push(`archive file name "${zipName}" != the recorded upstream name "${a.name}" (a browser copy such as "… (1).zip" is renamed back by hand; a different file is refused)`);
  if (licRow && (licRow.archive_name ?? null) !== (a.name ?? null)) problems.push(`LICENSES.json ${row}.archive_name "${licRow.archive_name ?? null}" != lock archive.name "${a.name ?? null}"`);
  if (licRow && (licRow.archive_bytes ?? null) !== (a.bytes ?? null)) problems.push(`LICENSES.json ${row}.archive_bytes ${licRow.archive_bytes ?? null} != lock archive.bytes ${a.bytes ?? null}`);
  let bytesFrom = null;
  if (a.bytes != null) {
    if (bytes !== a.bytes && !(mode === 'restage' && newVersion)) problems.push(`the zip is ${bytes} B; the recorded upstream archive is ${a.bytes} B${mode === 'restage' ? ` (a new upstream version needs <!-- r5-ruling archive-new-version-${row}=accepted -->)` : ''}`);
  } else if (!sizeRuling) {
    problems.push(`no byte size is recorded for ${row}'s archive, so nothing ties this zip to the upstream file: needs the orchestrator ruling <!-- r5-ruling archive-size-${row}=first-fetch --> in ${PLAN} §8.3`);
  } else {
    const w = a.approxBytes;
    if (w && (bytes < w.min || bytes > w.max)) problems.push(`the zip is ${bytes} B, outside the recorded window ${w.min}–${w.max} B (${w.from})`);
    else bytesFrom = `first fetch (ruling archive-size-${row}=first-fetch)`;
  }
  const listing = memberListing(entries);
  const usable = entries.filter((e) => !junkMember(e));
  const staged = Object.keys(ent?.files || {});
  const used = new Set();
  for (const rel of staged) { const h = memberFor(usable, rel); if (h.length === 1) used.add(h[0].name); }
  const beyond = listing.members - used.size;
  if (mode === 'refetch' && beyond < 1) problems.push(`the zip holds only the ${used.size} staged member(s) and nothing else: a re-zip of the trimmed subset, not the upstream archive`);
  if (a.members != null && a.members !== listing.members && !(mode === 'restage' && newVersion)) problems.push(`the zip has ${listing.members} members; the recorded archive has ${a.members}`);
  if (a.listingSha256 && a.listingSha256 !== listing.sha256 && !(mode === 'restage' && newVersion)) problems.push(`member listing SHA-256 ${listing.sha256.slice(0, 12)}… != recorded ${a.listingSha256.slice(0, 12)}…`);
  return { problems, listing, beyond, stagedMembers: used.size, bytesFrom };
}

function writeListing(row, listing, root) {
  const dir = path.join(root, LISTINGS);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${row}.tsv`), listing.text);
}
/** The download date of an archive when none is given: its mtime (the browser writes it at download), as YYYY-MM-DD. */
const zipDay = (zip) => statSync(zip).mtime.toISOString().slice(0, 10);
async function licRowOf(row, root) {
  const { loadManifest } = await import('../licences/lib.mjs');
  return loadManifest(root)?.rows.find((r) => r.id === row) || null;
}

/** stage-dir: files already extracted; archive hash unknown until verify-zip. */
export async function stageDir({ row, from, keeps = [], move = false, archiveName, archiveBytes, retrieved, page = null, dir = null, root = ROOT }) {
  if (!row || !from || !retrieved) throw new Error('stage-dir needs --row --from --retrieved (and --archive-name / --archive-bytes when known)');
  const dirName = dir || loadLock(root).sources[row]?.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root), dirName);
  mkdirSync(dst, { recursive: true });
  const files = {};
  let total = 0;
  for (const rel of walkFiles(from)) {
    if (!kept(rel, keeps)) continue;
    const to = path.join(dst, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    if (move) renameSync(path.join(from, rel), to); else cloneFile(path.join(from, rel), to);   // copy-on-write: ~0 bytes
    const buf = readFileSync(to);
    files[rel] = { bytes: buf.length, sha256: sha(buf) };
    total += buf.length;
  }
  const lock = loadLock(root);
  lock.sources[row] = { row, dir: dirName, archive: { name: archiveName || null, bytes: archiveBytes ? Number(archiveBytes) : null, sha256: null, retrieved, page }, strip: null, files, totalBytes: total, stagedFrom: 'extracted copy (archive not on disk): run verify-zip with the archive to record its SHA-256' };
  saveLock(lock, root);
  return { row, files: Object.keys(files).length, totalBytes: total };
}

/** The sha256sum-manifest hash of a multi-file source: sorted `<sha256>  <basename>\n` lines. */
export function manifestSha256(files) {
  const lines = files.map((f) => `${f.sha256}  ${path.basename(f.path)}`).sort();
  return sha(Buffer.from(`${lines.join('\n')}\n`));
}

/** stage-files: a multi-file source with no archive (row.files[] + row.archive_sha256 = manifest hash). */
export async function stageFiles({ row, dir = null, root = ROOT }) {
  const { loadManifest } = await import('../licences/lib.mjs');
  const r = loadManifest(root)?.rows.find((x) => x.id === row);
  if (!r) throw new Error(`no LICENSES.json row "${row}"`);
  if (!Array.isArray(r.files) || !r.files.length) throw new Error(`row "${row}" lists no files[] (use stage-zip / stage-dir)`);
  const bad = [];
  for (const f of r.files) {
    const abs = path.join(root, f.path);
    if (!existsSync(abs)) { bad.push(`${f.path}: missing`); continue; }
    const buf = readFileSync(abs);
    if (sha(buf) !== f.sha256 || (f.bytes != null && buf.length !== f.bytes)) bad.push(`${f.path}: differs from the row's sha256/bytes`);
  }
  const manifest = manifestSha256(r.files);
  if (manifest !== r.archive_sha256) bad.push(`manifest SHA-256 ${manifest.slice(0, 12)}… != row archive_sha256 ${String(r.archive_sha256).slice(0, 12)}…`);
  if (bad.length) return { row, ok: false, problems: bad };
  const dirName = dir || loadLock(root).sources[row]?.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root), dirName);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  const files = {};
  let total = 0;
  for (const f of r.files) {
    const rel = path.basename(f.path);
    cloneFile(path.join(root, f.path), path.join(dst, rel));
    files[rel] = { bytes: f.bytes ?? statSync(path.join(dst, rel)).size, sha256: f.sha256 };
    total += files[rel].bytes;
  }
  const lock = loadLock(root);
  lock.sources[row] = { row, dir: dirName, archive: { name: 'sha256sum manifest of the downloaded files (no single archive)', kind: 'file-manifest',
    bytes: total, sha256: manifest, retrieved: r.retrieved ?? null, page: r.source_url ?? null }, strip: null, files, totalBytes: total };
  saveLock(lock, root);
  return { row, ok: true, sha256: manifest, files: Object.keys(files).length, totalBytes: total };
}

/** stage-zip: extract kept members from an archive and record its SHA-256. */
export async function stageZip({ row, zip, keeps = [], strip = null, retrieved, page = null, deleteZip = false, dir = null, root = ROOT, env = process.env }) {
  if (!row || !zip) throw new Error('stage-zip needs --row --zip');
  const { sha256, bytes } = await sha256File(zip);
  const z = await openZip(zip);
  const prior = loadLock(root).sources[row] || null;
  const licRow = await licRowOf(row, root);
  // identity (fix round 3): a known source (lock entry, or a row that names its archive) is re-staged only from the
  // archive the record names; a brand-new source's first stage defines the record (name + size + listing)
  const declared = prior || (licRow?.archive_name || licRow?.archive_bytes != null
    ? { archive: { name: licRow.archive_name ?? null, bytes: licRow.archive_bytes ?? null }, files: {} } : null);
  const id = declared
    ? archiveIdentity({ row, ent: declared, licRow, zipName: path.basename(zip), bytes, entries: z.entries, rulingMap: rulings(root), mode: 'restage' })
    : { problems: [], listing: memberListing(z.entries), bytesFrom: null };
  const keptRel = (e) => {
    if (e.dir) return null;
    let rel = e.name;
    if (strip) { if (!rel.startsWith(strip)) return null; rel = rel.slice(strip.length); }
    return !rel || rel.startsWith('__MACOSX/') || rel.includes('/.') || !kept(rel, keeps) ? null : rel;
  };
  const keptCount = z.entries.filter((e) => keptRel(e) !== null).length;
  // a staged source is a TRIMMED subset of a real archive: keeping every member makes the zip indistinguishable from a
  // re-zip of the kept files (status() FAILs such a record), so it is refused here; a multi-file download uses stage-files
  if (!keptCount) id.problems.push('no member matches the --keep globs');
  else if (keptCount >= id.listing.members) id.problems.push(`the --keep globs select all ${id.listing.members} members: a staged source must be a trimmed subset of the archive (else use stage-files)`);
  if (prior?.archive?.sha256 && prior.archive.sha256 !== sha256 && rulings(root)[`archive-new-version-${row}`] !== 'accepted') {
    id.problems.push(`archive SHA-256 ${sha256.slice(0, 12)}… != recorded ${prior.archive.sha256.slice(0, 12)}… (a new upstream version needs <!-- r5-ruling archive-new-version-${row}=accepted -->)`);
  }
  if (id.problems.length) { await z.close(); return { row, ok: false, sha256, bytes, problems: id.problems }; }
  const dirName = dir || prior?.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root, env), dirName);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  const files = {};
  let total = 0;
  try {
    for (const e of z.entries) {
      const rel = keptRel(e);
      if (rel === null) continue;
      if (rel.split('/').includes('..')) throw new Error(`refusing member with "..": ${e.name}`);
      const buf = await z.read(e);
      const to = path.join(dst, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, buf);
      files[rel] = { bytes: buf.length, sha256: sha(buf) };
      total += buf.length;
    }
  } finally { await z.close(); }
  const day = retrieved || zipDay(zip);
  const lock = loadLock(root);
  const name = prior?.archive?.name || licRow?.archive_name || path.basename(zip);   // equal to the zip's when declared (checked)
  lock.sources[row] = { row, dir: dirName, archive: { ...(prior?.archive?.approxBytes ? { approxBytes: prior.archive.approxBytes } : {}),
    name, bytes, sha256, members: id.listing.members, listingSha256: id.listing.sha256, retrieved: day, page: page ?? prior?.archive?.page ?? null },
  strip, files, totalBytes: total, verifiedAgainstArchive: true };
  saveLock(lock, root);
  writeListing(row, id.listing, root);
  await updateRow(row, { archive_sha256: sha256, archive_bytes: bytes, archive_name: name, retrieved: day, pending: undefined }, root);
  if (deleteZip) rmSync(zip, { force: true });
  return { row, ok: true, sha256, bytes, members: id.listing.members, files: Object.keys(files).length, totalBytes: total, zipDeleted: deleteZip };
}

/** verify-zip: the staged files must equal their members in this archive, byte for byte. */
export async function verifyZip({ row, zip, retrieved = null, deleteZip = false, root = ROOT }) {
  const lock = loadLock(root);
  const ent = lock.sources[row];
  if (!ent) throw new Error(`no staged source "${row}" in ${LOCK}`);
  const { sha256, bytes } = await sha256File(zip);
  const z = await openZip(zip);
  const out = { row, sha256, bytes, expectedName: ent.archive.name ?? null, expectedBytes: ent.archive.bytes ?? null, checked: 0, mismatched: [], missing: [], ambiguous: [], problems: [] };
  try {
    // identity first (fix round 3): name, size, members beyond the staged subset, recorded listing; nothing is
    // recorded for a zip that is not the named upstream archive, however many staged files it matches
    const id = archiveIdentity({ row, ent, licRow: await licRowOf(row, root), zipName: path.basename(zip), bytes, entries: z.entries, rulingMap: rulings(root) });
    Object.assign(out, { members: id.listing.members, membersBeyondStaged: id.beyond });
    out.problems.push(...id.problems);
    if (ent.archive.sha256 && ent.archive.sha256 !== sha256) out.problems.push(`archive SHA-256 ${sha256.slice(0, 12)}… != recorded ${ent.archive.sha256.slice(0, 12)}…`);
    if (!out.problems.length) {
      const members = z.entries.filter((e) => !junkMember(e));
      for (const [rel, rec] of Object.entries(ent.files)) {
        const hits = memberFor(members, rel);
        if (!hits.length) { out.missing.push(rel); continue; }
        if (hits.length > 1) { out.ambiguous.push({ rel, members: hits.map((h) => h.name) }); continue; }
        const buf = await z.read(hits[0]);
        out.checked++;
        if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) out.mismatched.push({ rel, member: hits[0].name, bytes: buf.length, staged: rec.bytes });
      }
    }
    out.ok = !out.problems.length && !out.mismatched.length && !out.missing.length && !out.ambiguous.length && out.checked === Object.keys(ent.files).length;
    if (out.ok) {
      ent.archive = { ...ent.archive, bytes: ent.archive.bytes ?? bytes, ...(id.bytesFrom ? { bytesFrom: id.bytesFrom } : {}), sha256,
        members: id.listing.members, listingSha256: id.listing.sha256, retrieved: retrieved || zipDay(zip) };
      delete ent.stagedFrom;
      ent.verifiedAgainstArchive = true;
      saveLock(lock, root);
      writeListing(row, id.listing, root);
      await updateRow(row, { archive_sha256: sha256, archive_bytes: ent.archive.bytes, retrieved: ent.archive.retrieved, pending: undefined }, root);
    }
  } finally { await z.close(); }
  if (out.ok && deleteZip) { rmSync(zip, { force: true }); out.zipDeleted = true; }
  return out;
}

/**
 * restore (W0b fix round 2): put a source's staged files back EXACTLY as the lock records them, after r5-src was lost
 * (a fresh worktree; the Oct 22 reboot cleared the scratch the W0b copies were cloned from). From a local directory
 * (`--from`) or from the archive (`--zip`). Every lock file must be found (exact relative path, else a unique member /
 * file whose path ends in `/<rel>`) and equal its lock bytes + SHA-256 before anything is written: the files go into a
 * temporary sibling directory that replaces `r5-src/<dir>` only when all of them verified (all or nothing). The lock's
 * file list is never changed. With `--zip` (fix round 3) the archive must first pass `archiveIdentity` (recorded name
 * and size, members beyond the staged subset, recorded listing) and, when a SHA-256 is recorded, equal it; an
 * unrecorded hash is then recorded with the member listing (lock + listing file + LICENSES.json row; the name and size
 * are never taken from the zip), so `restore --zip … --delete-zip` is the whole W0b re-fetch for one archive.
 * `env` only selects r5-src (R5_SRC); the scratch controls pass `{}`.
 */
export async function restore({ row, from = null, zip = null, deleteZip = false, retrieved = null, root = ROOT, env = process.env }) {
  if (!row || (!from && !zip) || (from && zip)) throw new Error('restore needs --row and exactly one of --from <dir> | --zip <archive.zip>');
  const lock = loadLock(root);
  const ent = lock.sources[row];
  if (!ent) throw new Error(`no lock entry "${row}" in ${LOCK}: nothing to restore (use stage-zip / stage-dir)`);
  const dirName = ent.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root, env), dirName);
  const tmp = path.join(srcDir(root, env), `.${dirName}.restore-${process.pid}`);
  const out = { row, dir: `${SRC_REL}/${dirName}`, from: from || null, zip: zip ? path.basename(zip) : null, files: Object.keys(ent.files).length, written: 0, missing: [], mismatched: [], ambiguous: [] };
  let z = null, members = null, archive = null, id = null;
  if (zip) {
    archive = await sha256File(zip);
    out.archiveSha256 = archive.sha256; out.archiveBytes = archive.bytes;
    z = await openZip(zip);
    id = archiveIdentity({ row, ent, licRow: await licRowOf(row, root), zipName: path.basename(zip), bytes: archive.bytes, entries: z.entries, rulingMap: rulings(root) });
    Object.assign(out, { members: id.listing.members, membersBeyondStaged: id.beyond });
    const problems = [...id.problems];
    if (ent.archive.sha256 && ent.archive.sha256 !== archive.sha256) problems.push(`archive SHA-256 ${archive.sha256.slice(0, 12)}… != recorded ${ent.archive.sha256.slice(0, 12)}… (a different archive; a new upstream version is re-staged with stage-zip under its ruling)`);
    if (problems.length) { await z.close(); return { ...out, ok: false, problems }; }
    members = z.entries.filter((e) => !junkMember(e));
  }
  const fromFiles = from ? walkFiles(path.resolve(from)) : null;
  mkdirSync(path.dirname(tmp), { recursive: true });
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    for (const [rel, rec] of Object.entries(ent.files)) {
      let buf = null, src = null;
      if (z) {
        const hits = memberFor(members, rel);
        if (hits.length !== 1) { (hits.length ? out.ambiguous : out.missing).push(rel); continue; }
        buf = await z.read(hits[0]);
      } else {
        const hits = fromFiles.includes(rel) ? [rel] : fromFiles.filter((f) => f.endsWith(`/${rel}`));
        if (hits.length !== 1) { (hits.length ? out.ambiguous : out.missing).push(rel); continue; }
        src = path.join(path.resolve(from), hits[0]);
        buf = readFileSync(src);
      }
      if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) { out.mismatched.push({ rel, bytes: buf.length, lockBytes: rec.bytes }); continue; }
      const to = path.join(tmp, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      if (src) cloneFile(src, to); else writeFileSync(to, buf);   // copy-on-write from a local copy: ~0 bytes
      out.written++;
    }
  } finally { if (z) await z.close(); }
  out.ok = !out.missing.length && !out.mismatched.length && !out.ambiguous.length && out.written === out.files;
  if (!out.ok) { rmSync(tmp, { recursive: true, force: true }); out.written = 0; return out; }
  rmSync(dst, { recursive: true, force: true });
  renameSync(tmp, dst);
  if (zip && !ent.archive.sha256) {
    ent.archive = { ...ent.archive, bytes: ent.archive.bytes ?? archive.bytes, ...(id.bytesFrom ? { bytesFrom: id.bytesFrom } : {}), sha256: archive.sha256,
      members: id.listing.members, listingSha256: id.listing.sha256, retrieved: retrieved || zipDay(zip) };
    delete ent.stagedFrom;
    ent.verifiedAgainstArchive = true;
    saveLock(lock, root);
    writeListing(row, id.listing, root);
    await updateRow(row, { archive_sha256: archive.sha256, archive_bytes: ent.archive.bytes, retrieved: ent.archive.retrieved, pending: undefined }, root);
    out.recorded = true;
  }
  if (zip && deleteZip) { rmSync(zip, { force: true }); out.zipDeleted = true; }
  return out;
}

/**
 * record-per-file (fix round 3): a source whose upstream archive can no longer be fetched (UAL1: itch has served v3.0
 * since 16 Jun 2026; the shipped files are v1) is recorded by the per-file SHA-256 manifest of its staged files, the
 * stage-files form (`kind: 'file-manifest'`), ONLY under the orchestrator ruling
 * `<!-- r5-ruling archive-per-file-<row>=accepted -->`. Every staged file must be present and equal to the lock. The
 * row's `archive_sha256` is then that manifest hash (never presented as an archive's) and `archive_note` says why.
 */
export async function recordPerFile({ row, root = ROOT, env = process.env, today = new Date().toISOString().slice(0, 10) }) {
  const key = `archive-per-file-${row}`;
  if (rulings(root)[key] !== 'accepted') return { row, ok: false, problems: [`needs the orchestrator ruling <!-- r5-ruling ${key}=accepted --> in ${PLAN} §8.3`] };
  const lock = loadLock(root);
  const ent = lock.sources[row];
  if (!ent) return { row, ok: false, problems: [`no lock entry "${row}"`] };
  if (ent.archive.sha256 && ent.archive.kind !== 'file-manifest') return { row, ok: false, problems: ['an archive SHA-256 is already recorded: nothing to replace it with'] };
  const base = path.join(srcDir(root, env), ent.dir || DIRS[row] || row);
  const bad = [];
  for (const [rel, rec] of Object.entries(ent.files)) {
    const f = path.join(base, rel);
    if (!existsSync(f)) { bad.push(`${rel}: missing`); continue; }
    const buf = readFileSync(f);
    if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) bad.push(`${rel}: differs from the lock`);
  }
  if (bad.length) return { row, ok: false, problems: bad };
  const manifest = manifestSha256(Object.entries(ent.files).map(([rel, rec]) => ({ path: rel, sha256: rec.sha256 })));
  ent.archive = { ...ent.archive, kind: 'file-manifest', sha256: manifest, ruling: `${key}=accepted`, retrieved: ent.archive.retrieved || today };
  delete ent.stagedFrom;
  saveLock(lock, root);
  await updateRow(row, { archive_sha256: manifest, retrieved: ent.archive.retrieved, pending: undefined,
    archive_note: `per-file SHA-256 manifest of the ${Object.keys(ent.files).length} staged files (ruling ${key}=accepted): the upstream archive of this version can no longer be fetched` }, root);
  return { row, ok: true, sha256: manifest, files: Object.keys(ent.files).length };
}

function gitIgnored(rel, root) {
  try { execFileSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: root, stdio: 'ignore' }); return true; } catch (e) { if (e.status === 1) return false; throw e; }
}
function findZips(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) findZips(abs, out); else if (/\.zip$/i.test(name)) out.push(abs);
  }
  return out;
}

/** A-sources-staged. Returns { pass: true|null|false, detail }. */
export async function status({ root = ROOT, env = process.env } = {}) {
  const { loadManifest, CODE_LICENCES } = await import('../licences/lib.mjs');
  const manifest = loadManifest(root);
  const lock = loadLock(root);
  const dir = srcDir(root, env);
  const problems = [], pending = [];
  const present = existsSync(dir);
  const real = present ? realpathSync(dir) : null;
  if (!present) problems.push(`${SRC_REL} is missing`);
  const ignored = gitIgnored(SRC_REL, root) && gitIgnored(`${SRC_REL}/ubc/x.gltf`, root);
  if (!ignored) problems.push(`${SRC_REL} is not git-ignored`);
  // every non-legacy third-party ASSET row (a downloaded source) must be staged; rows built from sources say `derived_from`
  const rows = manifest?.rows || [];
  const tpSources = rows.filter((r) => !r.legacy && !r.ip && r.licence !== 'project-original' && !CODE_LICENCES.includes(r.licence) && !r.derived_from).map((r) => r.id);
  const required = [...new Set([...REQUIRED, ...tpSources])].sort();
  const sources = {};
  let lockBytes = 0;
  for (const id of required) {
    const ent = lock.sources[id];
    const row = rows.find((r) => r.id === id);
    const s = { row: !!row, staged: !!ent };
    sources[id] = s;
    if (!row) { problems.push(`${id}: no LICENSES.json row`); continue; }
    if (!ent) { problems.push(`${id}: not staged in ${SRC_REL} (stage it with tools/build/sources.mjs)`); continue; }
    const base = path.join(dir, ent.dir || DIRS[id] || id);
    const bad = [], miss = [];
    for (const [rel, rec] of Object.entries(ent.files)) {
      const f = path.join(base, rel);
      if (!existsSync(f)) { miss.push(rel); continue; }
      const buf = readFileSync(f);
      if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) bad.push(rel);
    }
    const onDisk = existsSync(base) ? walkFiles(base) : [];
    const extra = onDisk.filter((f) => !(f in ent.files));
    Object.assign(s, { dir: `${SRC_REL}/${ent.dir || DIRS[id] || id}`, files: Object.keys(ent.files).length, bytes: ent.totalBytes, missing: miss.slice(0, 6), changed: bad.slice(0, 6), extra: extra.slice(0, 6),
      archive: { name: ent.archive.name, bytes: ent.archive.bytes, sha256: ent.archive.sha256, retrieved: ent.archive.retrieved, members: ent.archive.members ?? null,
        listingSha256: ent.archive.listingSha256 ?? null, ...(ent.archive.bytesFrom ? { bytesFrom: ent.archive.bytesFrom } : {}) },
      rowArchive: { name: row.archive_name ?? null, bytes: row.archive_bytes ?? null, sha256: row.archive_sha256 ?? null },
      verifiedAgainstArchive: !!ent.verifiedAgainstArchive || (!!ent.archive.sha256 && !ent.stagedFrom) });
    lockBytes += ent.totalBytes;
    if (miss.length) problems.push(`${id}: ${miss.length} staged file(s) missing — restore them with tools/build/sources.mjs restore --row ${id} --zip <archive> --delete-zip (or --from <extracted dir>)`);
    if (bad.length) problems.push(`${id}: ${bad.length} staged file(s) differ from the lock`);
    if (extra.length) problems.push(`${id}: ${extra.length} file(s) on disk not in the lock`);
    // archive identity (fix round 3): the lock and the row name the same upstream file, and a recorded hash carries
    // the size and member listing that tie it to that file (a hand-edited or re-zipped record FAILs here)
    for (const d of archiveAgreement(row, ent, { root })) problems.push(`${id}: ${d}`);
    if (!ent.archive.sha256) pending.push(`${id}: archive SHA-256 not recorded yet (${ent.archive.name ?? 'archive name not recorded'}, ${ent.archive.bytes ?? '?'} B, retrieved ${ent.archive.retrieved}) — needs the archive: tools/build/sources.mjs restore --row ${id} --zip <file> --delete-zip (verify-zip when the staged files are present)`);
  }
  const strays = Object.keys(lock.sources).filter((k) => !required.includes(k));
  // every directory under r5-src belongs to exactly one lock entry (a renamed or abandoned source dir is not "staged")
  const lockDirs = new Set(Object.entries(lock.sources).map(([id, e]) => e.dir || DIRS[id] || id));
  const strayDirs = present ? readdirSync(dir).filter((n) => n !== '.DS_Store' && !lockDirs.has(n)) : [];
  for (const n of strayDirs) problems.push(`${SRC_REL}/${n} belongs to no lock entry`);
  const totalBytes = duBytes(dir);
  if (totalBytes > CAP_BYTES) problems.push(`${SRC_REL} is ${(totalBytes / 1048576).toFixed(1)} MB > 150 MB`);
  // transient archives: none left under models-staging/ or this lane's scratch
  const zips = findZips(path.join(root, 'models-staging'));
  if (zips.length) problems.push(`transient archive(s) still on disk: ${zips.map((z) => path.relative(root, z)).join(', ')}`);
  const pass = problems.length ? false : pending.length ? null : true;
  return { pass, detail: { dir: SRC_REL, realPath: real, gitIgnored: ignored, required, layout: layout(root), sources, unrequiredLockEntries: strays, strayDirs,
    mb: +(totalBytes / 1048576).toFixed(2), lockMb: +(lockBytes / 1048576).toFixed(2), capMb: 150, transientZips: zips, problems, pending } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const cmd = a[0];
  const val = (f, d = null) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const all = (f) => a.flatMap((x, i) => (x === f ? [a[i + 1]] : []));
  let res;
  if (cmd === 'stage-dir') res = await stageDir({ row: val('--row'), from: val('--from'), keeps: all('--keep'), move: a.includes('--move'), archiveName: val('--archive-name'), archiveBytes: val('--archive-bytes'), retrieved: val('--retrieved'), page: val('--page'), dir: val('--dir') });
  else if (cmd === 'stage-zip') res = await stageZip({ row: val('--row'), zip: val('--zip'), keeps: all('--keep'), strip: val('--strip'), retrieved: val('--retrieved'), page: val('--page'), deleteZip: a.includes('--delete-zip'), dir: val('--dir') });
  else if (cmd === 'layout') res = layout();
  else if (cmd === 'stage-files') res = await stageFiles({ row: val('--row'), dir: val('--dir') });
  else if (cmd === 'verify-zip') res = await verifyZip({ row: val('--row'), zip: val('--zip'), retrieved: val('--retrieved'), deleteZip: a.includes('--delete-zip') });
  else if (cmd === 'record-per-file') res = await recordPerFile({ row: val('--row') });
  else if (cmd === 'restore') res = await restore({ row: val('--row'), from: val('--from'), zip: val('--zip'), retrieved: val('--retrieved'), deleteZip: a.includes('--delete-zip') });
  else if (cmd === 'status') res = await status();
  else { console.error('usage: sources.mjs stage-zip | stage-dir | stage-files | verify-zip | restore | record-per-file | status | layout  (see the header)'); process.exit(2); }
  console.log(JSON.stringify(res, null, a.includes('--json') || cmd === 'status' ? 2 : 0));
  if ((cmd === 'verify-zip' || cmd === 'stage-files' || cmd === 'restore' || cmd === 'stage-zip' || cmd === 'record-per-file') && !res.ok) process.exitCode = 1;
  if (cmd === 'status' && res.pass === false) process.exitCode = 1;
}
