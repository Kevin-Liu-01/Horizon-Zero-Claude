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
 *   node tools/build/sources.mjs status [--json]      the A-sources-staged report
 *   node tools/build/sources.mjs layout               row id -> directory, one JSON line (the published layout)
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
export async function stageZip({ row, zip, keeps = [], strip = null, retrieved, page = null, deleteZip = false, dir = null, root = ROOT }) {
  if (!row || !zip) throw new Error('stage-zip needs --row --zip');
  const { sha256, bytes } = await sha256File(zip);
  const z = await openZip(zip);
  const dirName = dir || loadLock(root).sources[row]?.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root), dirName);
  rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  const files = {};
  let total = 0;
  try {
    for (const e of z.entries) {
      if (e.dir) continue;
      let rel = e.name;
      if (strip) { if (!rel.startsWith(strip)) continue; rel = rel.slice(strip.length); }
      if (!rel || rel.startsWith('__MACOSX/') || rel.includes('/.') || !kept(rel, keeps)) continue;
      if (rel.split('/').includes('..')) throw new Error(`refusing member with "..": ${e.name}`);
      const buf = await z.read(e);
      const to = path.join(dst, rel);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, buf);
      files[rel] = { bytes: buf.length, sha256: sha(buf) };
      total += buf.length;
    }
  } finally { await z.close(); }
  const day = retrieved || new Date().toISOString().slice(0, 10);
  const lock = loadLock(root);
  lock.sources[row] = { row, dir: dirName, archive: { name: path.basename(zip), bytes, sha256, retrieved: day, page }, strip, files, totalBytes: total };
  saveLock(lock, root);
  await updateRow(row, { archive_sha256: sha256, archive_bytes: bytes, retrieved: day, pending: undefined }, root);
  if (deleteZip) rmSync(zip, { force: true });
  return { row, sha256, bytes, files: Object.keys(files).length, totalBytes: total, zipDeleted: deleteZip };
}

/** verify-zip: the staged files must equal their members in this archive, byte for byte. */
export async function verifyZip({ row, zip, retrieved = null, deleteZip = false, root = ROOT }) {
  const lock = loadLock(root);
  const ent = lock.sources[row];
  if (!ent) throw new Error(`no staged source "${row}" in ${LOCK}`);
  const { sha256, bytes } = await sha256File(zip);
  const z = await openZip(zip);
  const out = { row, sha256, bytes, expectedBytes: ent.archive.bytes, checked: 0, mismatched: [], missing: [], ambiguous: [] };
  try {
    const members = z.entries.filter((e) => !e.dir);
    for (const [rel, rec] of Object.entries(ent.files)) {
      const hits = members.filter((e) => e.name === rel || e.name.endsWith(`/${rel}`));
      if (!hits.length) { out.missing.push(rel); continue; }
      if (hits.length > 1) { out.ambiguous.push({ rel, members: hits.map((h) => h.name) }); continue; }
      const buf = await z.read(hits[0]);
      out.checked++;
      if (buf.length !== rec.bytes || sha(buf) !== rec.sha256) out.mismatched.push({ rel, member: hits[0].name, bytes: buf.length, staged: rec.bytes });
    }
  } finally { await z.close(); }
  out.ok = !out.mismatched.length && !out.missing.length && !out.ambiguous.length && out.checked === Object.keys(ent.files).length;
  if (out.ok) {
    ent.archive = { ...ent.archive, name: path.basename(zip), bytes, sha256, retrieved: retrieved || ent.archive.retrieved };
    delete ent.stagedFrom;
    ent.verifiedAgainstArchive = true;
    saveLock(lock, root);
    await updateRow(row, { archive_sha256: sha256, archive_bytes: bytes, retrieved: ent.archive.retrieved, pending: undefined }, root);
    if (deleteZip) { rmSync(zip, { force: true }); out.zipDeleted = true; }
  }
  return out;
}

/**
 * restore (W0b fix round 2): put a source's staged files back EXACTLY as the lock records them, after r5-src was lost
 * (a fresh worktree; the Oct 22 reboot cleared the scratch the W0b copies were cloned from). From a local directory
 * (`--from`) or from the archive (`--zip`). Every lock file must be found (exact relative path, else a unique member /
 * file whose path ends in `/<rel>`) and equal its lock bytes + SHA-256 before anything is written: the files go into a
 * temporary sibling directory that replaces `r5-src/<dir>` only when all of them verified (all or nothing). The lock's
 * file list is never changed. With `--zip`, a recorded archive SHA-256 must equal the archive's; an unrecorded one is
 * recorded (lock + LICENSES.json row), so `restore --zip … --delete-zip` is the whole W0b re-fetch for one archive:
 * hash recorded, trimmed sources staged, zip deleted.
 */
export async function restore({ row, from = null, zip = null, deleteZip = false, retrieved = null, root = ROOT }) {
  if (!row || (!from && !zip) || (from && zip)) throw new Error('restore needs --row and exactly one of --from <dir> | --zip <archive.zip>');
  const lock = loadLock(root);
  const ent = lock.sources[row];
  if (!ent) throw new Error(`no lock entry "${row}" in ${LOCK}: nothing to restore (use stage-zip / stage-dir)`);
  const dirName = ent.dir || DIRS[row] || row;
  const dst = path.join(srcDir(root), dirName);
  const tmp = path.join(srcDir(root), `.${dirName}.restore-${process.pid}`);
  const out = { row, dir: `${SRC_REL}/${dirName}`, from: from || null, zip: zip ? path.basename(zip) : null, files: Object.keys(ent.files).length, written: 0, missing: [], mismatched: [], ambiguous: [] };
  let z = null, members = null, archive = null;
  if (zip) {
    archive = await sha256File(zip);
    out.archiveSha256 = archive.sha256; out.archiveBytes = archive.bytes;
    if (ent.archive.sha256 && ent.archive.sha256 !== archive.sha256) {
      return { ...out, ok: false, problems: [`archive SHA-256 ${archive.sha256.slice(0, 12)}… != recorded ${ent.archive.sha256.slice(0, 12)}… (a different archive; re-stage with stage-zip if the pack changed)`] };
    }
    z = await openZip(zip);
    members = z.entries.filter((e) => !e.dir);
  }
  const fromFiles = from ? walkFiles(path.resolve(from)) : null;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    for (const [rel, rec] of Object.entries(ent.files)) {
      let buf = null, src = null;
      if (z) {
        const hits = members.filter((e) => e.name === rel || e.name.endsWith(`/${rel}`));
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
    ent.archive = { ...ent.archive, name: path.basename(zip), bytes: archive.bytes, sha256: archive.sha256, retrieved: retrieved || ent.archive.retrieved };
    delete ent.stagedFrom;
    ent.verifiedAgainstArchive = true;
    saveLock(lock, root);
    await updateRow(row, { archive_sha256: archive.sha256, archive_bytes: archive.bytes, retrieved: ent.archive.retrieved, pending: undefined }, root);
    out.recorded = true;
  }
  if (zip && deleteZip) { rmSync(zip, { force: true }); out.zipDeleted = true; }
  return out;
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
      archive: { name: ent.archive.name, bytes: ent.archive.bytes, sha256: ent.archive.sha256, retrieved: ent.archive.retrieved }, rowSha256: row.archive_sha256 ?? null,
      verifiedAgainstArchive: !!ent.verifiedAgainstArchive || (!!ent.archive.sha256 && !ent.stagedFrom) });
    lockBytes += ent.totalBytes;
    if (miss.length) problems.push(`${id}: ${miss.length} staged file(s) missing — restore them with tools/build/sources.mjs restore --row ${id} --zip <archive> --delete-zip (or --from <extracted dir>)`);
    if (bad.length) problems.push(`${id}: ${bad.length} staged file(s) differ from the lock`);
    if (extra.length) problems.push(`${id}: ${extra.length} file(s) on disk not in the lock`);
    if (!ent.archive.sha256) pending.push(`${id}: archive SHA-256 not recorded yet (${ent.archive.name ?? 'archive name not recorded'}, ${ent.archive.bytes ?? '?'} B, retrieved ${ent.archive.retrieved}) — needs the archive: tools/build/sources.mjs restore --row ${id} --zip <file> --delete-zip (verify-zip when the staged files are present)`);
    else if (row.archive_sha256 !== ent.archive.sha256) problems.push(`${id}: lock archive SHA-256 ${ent.archive.sha256.slice(0, 12)}… != LICENSES.json ${String(row.archive_sha256).slice(0, 12)}…`);
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
  else if (cmd === 'restore') res = await restore({ row: val('--row'), from: val('--from'), zip: val('--zip'), retrieved: val('--retrieved'), deleteZip: a.includes('--delete-zip') });
  else if (cmd === 'status') res = await status();
  else { console.error('usage: sources.mjs stage-zip | stage-dir | stage-files | verify-zip | restore | status | layout  (see the header)'); process.exit(2); }
  console.log(JSON.stringify(res, null, a.includes('--json') || cmd === 'status' ? 2 : 0));
  if ((cmd === 'verify-zip' || cmd === 'stage-files' || cmd === 'restore') && !res.ok) process.exitCode = 1;
  if (cmd === 'status' && res.pass === false) process.exitCode = 1;
}
