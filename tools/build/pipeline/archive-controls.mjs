#!/usr/bin/env node
/**
 * A-sources-staged — the ARCHIVE IDENTITY controls (pipeline lane, W0b fix rounds 3 and 4).
 *
 * Judge (W0b r0): "restore --zip and verify-zip record any zip's hash as the upstream archive's, so a self-made zip
 * passes the gates". These controls prove the refusal on the real code path (tools/build/sources.mjs restore,
 * verifyZip, stageZip, recordPerFile, archiveAgreement), in scratch.
 *
 * Fix round 4 (judge W0b-r3-eng: "the control suite throws in the state it exists to certify"): round 3 built its
 * cases on a REAL source that had its files on disk and copied that source's REAL lock record into every case, so the
 * expectations ("no byte size is recorded", "E records a hash") only held before the re-fetch; once UAL1 or MCO was
 * recorded, case E was refused and E' threw ENOENT on the listing, and with only file-manifest sources staged the suite
 * returned ok:null and the gate skipped it. Now:
 *   - every case runs on a SYNTHETIC scratch-only source (row `archive-control-synthetic`, three small files written in
 *     scratch). Its lock entry and LICENSES.json row are rebuilt per case from nothing but the case's needs, and added
 *     to scratch copies of the records root's lock and rows, so the outcome is the same whatever the real records hold
 *     (pre-fetch, post-fetch, any mix) and whatever is staged on disk; the suite never returns ok:null;
 *   - each case runs in its own try/catch (an exception is that case's FAIL, with the error, never a throw out of the
 *     suite), and E' / F are guarded on E having recorded;
 *   - `archiveControlsPostFetch` (the regression control) shapes the lock and rows as they will be AFTER the W0b
 *     re-fetch (UBC + MCO recorded by restore --zip with the plan §10.1 size, member count, listing file + hash; UAL2 by
 *     its first-fetch ruling; UAL1 by record-per-file under its ruling) and runs the same suite on them: it must pass
 *     every case there too. A-sources-staged runs both on every run and FAILs unless both are ok === true.
 *
 *   A  re-zip of exactly the staged files, recorded name, no recorded size, no ruling  -> restore AND verify-zip refuse
 *   B  the same re-zip after a forger set the recorded size to its size (lock + row)     -> refused: subset only
 *   C  a full zip (staged files + one more member) under a different file name           -> refused: name
 *   D  a full zip with one staged member changed by one byte (size recorded)            -> refused: mismatched member
 *   L  a full zip, no recorded size, first-fetch ruling, size outside the recorded      -> refused: window (the UAL2
 *      approxBytes window                                                                    path's guard)
 *   M  the full zip under a plan-§10.1-pinned row (ubc-standard), lock + row size moved -> refused: plan pin
 *      to the zip's size
 *   E  a full zip, no recorded size, ruling archive-size-<row>=first-fetch in the plan   -> accepted: hash, size
 *                                                                                           (bytesFrom), members,
 *                                                                                           listing recorded
 *   E' (after E) the recorded lock/row pair agrees (`archiveAgreement`), an edited member listing is caught
 *   F  after E, the subset re-zip again                                                 -> refused (hash, subset)
 *   G  a full zip whose size equals the recorded size, --delete-zip                     -> accepted, zip deleted
 *   H  stage-zip of the subset re-zip keeping every member, recorded size forged         -> refused (not a trimmed
 *                                                                                           subset)
 *   I  stage-zip of the full zip keeping the staged files, recorded size                -> accepted, same files
 *   J  `archiveAgreement` on the records root's real lock/rows: 0 disagreements; 5 hand edits (lock name, row size, a
 *      made-up hash in both with no size / listing, a hash in the row only, lock + row size of a §10.1-pinned row both
 *      moved) all caught — the term status() and tools/licences/check.mjs FAIL on
 *   K  record-per-file (UAL1's ruling path): refused without <!-- r5-ruling archive-per-file-<row>=accepted -->,
 *      with it the per-file SHA-256 manifest is recorded in the lock and the row (`archive_note` says why)
 *
 * Every refused case must leave the scratch lock, the scratch LICENSES.json, the scratch r5-src and the listing
 * directory untouched. The scratch plan is the records root's plan without any `r5-ruling archive-*` line plus only the
 * line a case adds. Nothing in the repository is written: every call takes `root` = the scratch root (and `env: {}`
 * or a scratch R5_SRC, so R5_SRC can never point a case at the real r5-src).
 *
 *   node tools/build/pipeline/archive-controls.mjs [--scratch <dir>]   -> one JSON line { ok, current, postFetch, postFetchUal1Archive }
 */
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync, cpSync, realpathSync, appendFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_SCRATCH = path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileSha = (f) => (existsSync(f) ? sha(readFileSync(f)) : null);
const loadS = (codeRoot) => import(pathToFileURL(path.join(codeRoot, 'tools/build/sources.mjs')).href);

/** The scratch-only control source. Never in the repository's lock or LICENSES.json (status() would require it). */
export const SYNTH = 'archive-control-synthetic';
const SYNTH_DIR = 'archive-control';
const SYNTH_NAME = 'Archive Control Pack[Standard].zip';
const SYNTH_FILES = {
  'License.txt': Buffer.from('Archive identity control pack: synthetic, scratch only, CC0.\n'),
  'Models/part.gltf': Buffer.from(`${JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'part.bin', byteLength: 4096 }] })}\n`),
  'Models/part.bin': Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 31 + 7) & 255)),
};
/** Cases the suite must run (and pass): A B C D L M E E' F G H I J K. */
export const N_CASES = 14;

const synthFiles = () => Object.fromEntries(Object.entries(SYNTH_FILES).map(([rel, b]) => [rel, { bytes: b.length, sha256: sha(b) }]));
function synthEntry({ row = SYNTH, name = SYNTH_NAME, bytes = null, approx = null } = {}) {
  const files = synthFiles();
  return { row, dir: SYNTH_DIR, archive: { ...(approx ? { approxBytes: approx } : {}), name, bytes, sha256: null, retrieved: null, page: 'https://example.invalid/archive-control' },
    strip: null, files, totalBytes: Object.values(files).reduce((n, f) => n + f.bytes, 0), stagedFrom: 'synthetic control source (scratch only)' };
}
function synthRow({ id = SYNTH, name = SYNTH_NAME, bytes = null } = {}) {
  return { id, paths: [`models-staging/r5-src/${SYNTH_DIR}/**`], title: 'Archive identity control pack (synthetic, scratch only)', author: 'CALIMA pipeline lane',
    source_url: 'https://example.invalid/archive-control', licence: 'CC0-1.0', archive_sha256: null, archive_bytes: bytes, archive_name: name, retrieved: null,
    modified: null, attribution: null, pending: 'synthetic control source: archive SHA-256 not recorded' };
}

/**
 * Run the identity controls. `root` holds the RECORDS the suite starts from (tools/build/sources.lock.json,
 * public/LICENSES.json, docs/ROUND5-PLAN.md, tools/build/sources.listings/); `codeRoot` holds the code under test.
 * Returns { ok: boolean, row, records, cases } (ok is never null).
 */
export async function archiveControls({ root = ROOT, codeRoot = ROOT, scratch = DEFAULT_SCRATCH, label = 'current records' } = {}) {
  const S = await loadS(codeRoot);
  const cases = [];
  const run = async (name, expect, fn) => {
    try { cases.push({ case: name, expect, ...(await fn()) }); } catch (e) { cases.push({ case: name, expect, ok: false, error: String(e?.stack || e).split('\n').slice(0, 3).join(' | ') }); }
  };
  mkdirSync(scratch, { recursive: true });
  const R = path.join(realpathSync(scratch), `archive-control-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  rmSync(R, { recursive: true, force: true });
  let setupError = null;
  try {
    const LOCKF = path.join(R, S.LOCK), MANF = path.join(R, 'public/LICENSES.json'), PLANF = path.join(R, S.PLAN);
    for (const f of [LOCKF, MANF, PLANF]) mkdirSync(path.dirname(f), { recursive: true });
    const planBase = readFileSync(path.join(root, S.PLAN), 'utf8').split('\n').filter((l) => !/<!--\s*r5-ruling\s+archive-/.test(l)).join('\n');
    const lockText = readFileSync(path.join(root, S.LOCK), 'utf8');
    const manText = readFileSync(path.join(root, 'public/LICENSES.json'), 'utf8');
    if (JSON.parse(lockText).sources[SYNTH] || JSON.parse(manText).rows.some((r) => r.id === SYNTH)) throw new Error(`the records root already holds the scratch-only row ${SYNTH}`);
    // the synthetic "upstream" files, as staged (a scratch r5-src: <stagedRoot>/<dir>/<rel>), and the zips built from them
    const stagedRoot = path.join(R, 'src-copy'), stagedDir = path.join(stagedRoot, SYNTH_DIR);
    for (const [rel, b] of Object.entries(SYNTH_FILES)) { mkdirSync(path.dirname(path.join(stagedDir, rel)), { recursive: true }); writeFileSync(path.join(stagedDir, rel), b); }
    const rels = Object.keys(SYNTH_FILES).sort();
    const files0 = synthFiles();
    const Z = path.join(R, 'zips'); mkdirSync(Z, { recursive: true });
    const zipAt = (out, cwd, members) => { mkdirSync(path.dirname(out), { recursive: true }); rmSync(out, { force: true }); execFileSync('zip', ['-X', '-q', out, ...members], { cwd }); return out; };
    const zsub = zipAt(path.join(Z, 'sub', SYNTH_NAME), stagedDir, rels);
    const extraDir = path.join(R, 'extra'); mkdirSync(path.join(extraDir, 'Extra'), { recursive: true });
    writeFileSync(path.join(extraDir, 'Extra/README.txt'), 'a member the trimmed subset does not keep\n');
    const zfull = path.join(Z, 'full', SYNTH_NAME);
    zipAt(zfull, stagedDir, rels); execFileSync('zip', ['-X', '-q', zfull, 'Extra/README.txt'], { cwd: extraDir });
    const modDir = path.join(R, 'mod');
    execFileSync('cp', ['-R', stagedDir, modDir]);
    appendFileSync(path.join(modDir, rels[0]), 'x');
    const zbad = path.join(Z, 'bad', SYNTH_NAME);
    zipAt(zbad, modDir, rels); execFileSync('zip', ['-X', '-q', zbad, 'Extra/README.txt'], { cwd: extraDir });
    const size = (f) => statSync(f).size;

    /** Scratch records = the records root's + ONE synthetic entry/row built from nothing but this case's needs. */
    const reset = ({ bytes = null, ruling = null, approx = null, asRow = SYNTH, name = SYNTH_NAME } = {}) => {
      rmSync(path.join(R, 'models-staging'), { recursive: true, force: true });
      rmSync(path.join(R, S.LISTINGS), { recursive: true, force: true });
      const l = JSON.parse(lockText), m = JSON.parse(manText);
      l.sources[asRow] = synthEntry({ row: asRow, name, bytes, approx });
      const row = synthRow({ id: asRow, name, bytes });
      const i = m.rows.findIndex((r) => r.id === asRow);
      if (i >= 0) m.rows[i] = row; else m.rows.push(row);
      writeFileSync(LOCKF, `${JSON.stringify(l, null, 2)}\n`);
      writeFileSync(MANF, `${JSON.stringify(m, null, 2)}\n`);
      writeFileSync(PLANF, ruling ? `${planBase}\n<!-- r5-ruling ${ruling} -->\n` : planBase);
    };
    const snap = (row) => ({ lock: fileSha(LOCKF), man: fileSha(MANF), staged: existsSync(path.join(R, S.SRC_REL, SYNTH_DIR)), listings: existsSync(path.join(R, S.LISTINGS)), row });
    const refused = async (zip, { want, row = SYNTH }) => {
      const before = snap(row);
      const r = await S.restore({ row, zip, root: R, env: {} });
      const v = await S.verifyZip({ row, zip, root: R });
      const after = snap(row);
      const probs = [...(r.problems || []), ...(r.mismatched || []).map((m) => `mismatched ${m.rel}`)];
      const vprobs = [...(v.problems || []), ...(v.mismatched || []).map((m) => `mismatched ${m.rel}`)];
      const untouched = before.lock === after.lock && before.man === after.man && !after.staged && !after.listings && existsSync(zip);
      const hit = (ps) => want.every((w) => ps.some((p) => p.includes(w)));
      return { zip: path.basename(zip), bytes: size(zip), ok: r.ok === false && v.ok === false && untouched && hit(probs) && hit(vprobs),
        restore: { ok: r.ok, problems: probs.slice(0, 4) }, verifyZip: { ok: v.ok, problems: vprobs.slice(0, 4) }, recordsUntouched: untouched };
    };
    const readRec = (row = SYNTH) => ({ ent: JSON.parse(readFileSync(LOCKF, 'utf8')).sources[row], row: JSON.parse(readFileSync(MANF, 'utf8')).rows.find((r) => r.id === row) });

    await run('A re-zip of the staged subset (no recorded size, no ruling)', 'refused', async () => { reset(); return refused(zsub, { want: ['no byte size is recorded', 'holds only the'] }); });
    await run('B re-zip of the staged subset, recorded size forged to match', 'refused', async () => { reset({ bytes: size(zsub) }); return refused(zsub, { want: ['holds only the'] }); });
    await run('C full zip under another file name', 'refused', async () => {
      const wrong = path.join(Z, 'c', `${SYNTH}.zip`); mkdirSync(path.dirname(wrong), { recursive: true }); copyFileSync(zfull, wrong);
      reset({ bytes: size(wrong) }); return refused(wrong, { want: [`archive file name "${SYNTH}.zip"`] });
    });
    await run('D full zip with one staged member changed', 'refused', async () => { reset({ bytes: size(zbad) }); return refused(zbad, { want: [`mismatched ${rels[0]}`] }); });
    await run('L full zip, no recorded size, first-fetch ruling, size outside the recorded window', 'refused', async () => {
      reset({ ruling: `archive-size-${SYNTH}=first-fetch`, approx: { min: size(zfull) + 1000, max: size(zfull) + 2000, from: 'synthetic window' } });
      return refused(zfull, { want: ['outside the recorded window'] });
    });
    await run('M full zip under a plan-§10.1-pinned row (ubc-standard), lock + row size moved to the zip', 'refused', async () => {
      const pinned = Object.keys(S.PLAN_BYTES)[0];
      const pname = 'Universal Base Characters[Standard].zip';
      const zm = path.join(Z, 'm', pname); mkdirSync(path.dirname(zm), { recursive: true }); copyFileSync(zfull, zm);
      reset({ asRow: pinned, name: pname, bytes: size(zm) });
      return { pinnedRow: pinned, ...(await refused(zm, { row: pinned, want: [`is not the plan's ${S.PLAN_BYTES[pinned]} B`] })) };
    });

    // E: positive under the ruling (no recorded size)
    let recordedE = null;
    await run('E full zip, no recorded size, ruling archive-size first-fetch', 'accepted + recorded', async () => {
      reset({ ruling: `archive-size-${SYNTH}=first-fetch` });
      const e = await S.restore({ row: SYNTH, zip: zfull, root: R, env: {} });
      const { ent, row } = readRec();
      const le = ent.archive;
      const lst = path.join(R, S.LISTINGS, `${SYNTH}.tsv`);
      const ok = e.ok === true && e.recorded === true && le.sha256 === fileSha(zfull) && le.bytes === size(zfull) && /first fetch/.test(le.bytesFrom || '')
        && le.members === rels.length + 1 && existsSync(lst) && fileSha(lst) === le.listingSha256 && le.name === SYNTH_NAME
        && row.archive_sha256 === le.sha256 && row.archive_bytes === le.bytes && row.archive_name === SYNTH_NAME && !row.pending
        && rels.every((r) => fileSha(path.join(R, S.SRC_REL, SYNTH_DIR, r)) === files0[r].sha256);
      if (ok) recordedE = { ent, row, lst, lock: fileSha(LOCKF), man: fileSha(MANF) };
      return { zip: SYNTH_NAME, bytes: size(zfull), ok, restore: { ok: e.ok, recorded: e.recorded, problems: e.problems },
        recorded: { sha256: le.sha256?.slice(0, 12) ?? null, bytes: le.bytes, bytesFrom: le.bytesFrom, members: le.members, listing: existsSync(lst) } };
    });
    // E': the recorded pair agrees (status / check.mjs term), and a changed listing file is caught (guarded on E)
    await run("E' recorded pair agrees; an edited member listing is caught", '[] then caught', async () => {
      if (!recordedE) return { ok: false, why: 'E did not record: nothing to compare' };
      const agree = S.archiveAgreement(recordedE.row, recordedE.ent, { root: R });
      const text = readFileSync(recordedE.lst);
      appendFileSync(recordedE.lst, '1\t00000000\tforged-member\n');
      const edited = S.archiveAgreement(recordedE.row, recordedE.ent, { root: R });
      writeFileSync(recordedE.lst, text);
      return { ok: agree.length === 0 && edited.some((d) => d.includes('does not hash')), agreement: { recorded: agree, listingEdited: edited } };
    });
    // F: the subset re-zip after the record exists (guarded on E)
    await run('F subset re-zip after the hash is recorded', 'refused', async () => {
      if (!recordedE) return { ok: false, why: 'E did not record: no recorded hash to refuse against' };
      const f = await S.restore({ row: SYNTH, zip: zsub, root: R, env: {} });
      const ok = f.ok === false && (f.problems || []).some((p) => p.startsWith('archive SHA-256')) && (f.problems || []).some((p) => p.includes('holds only the'))
        && fileSha(LOCKF) === recordedE.lock && fileSha(MANF) === recordedE.man;
      return { zip: SYNTH_NAME, bytes: size(zsub), ok, restore: { ok: f.ok, problems: f.problems || [] } };
    });
    // G: positive with the size recorded (the UBC / MCO path), --delete-zip
    await run('G full zip, recorded size, --delete-zip', 'accepted + zip deleted', async () => {
      const zg = path.join(Z, 'g', SYNTH_NAME); mkdirSync(path.dirname(zg), { recursive: true }); copyFileSync(zfull, zg);
      reset({ bytes: size(zg) });
      const g = await S.restore({ row: SYNTH, zip: zg, root: R, env: {}, deleteZip: true });
      const { ent, row } = readRec();
      const lg = ent.archive;
      const ok = g.ok === true && g.recorded === true && g.zipDeleted === true && !existsSync(zg) && lg.bytes === size(zfull) && !lg.bytesFrom && lg.members === rels.length + 1
        && lg.sha256 === fileSha(zfull) && row.archive_sha256 === lg.sha256 && S.archiveAgreement(row, ent, { root: R }).length === 0;
      return { zip: SYNTH_NAME, bytes: size(zfull), ok, restore: { ok: g.ok, recorded: g.recorded, zipDeleted: g.zipDeleted, problems: g.problems } };
    });
    // H: stage-zip (re-stage) of the subset re-zip with every member kept, size forged to match -> refused
    await run('H stage-zip of the subset re-zip, keep-all, size forged', 'refused', async () => {
      reset({ bytes: size(zsub) });
      const lockH = fileSha(LOCKF), manH = fileSha(MANF);
      const h = await S.stageZip({ row: SYNTH, zip: zsub, keeps: [], root: R, env: {} });
      const ok = h.ok === false && (h.problems || []).some((p) => p.includes('select all')) && fileSha(LOCKF) === lockH && fileSha(MANF) === manH
        && !existsSync(path.join(R, S.SRC_REL, SYNTH_DIR));
      return { zip: SYNTH_NAME, bytes: size(zsub), ok, stageZip: { ok: h.ok, problems: h.problems } };
    });
    // I: stage-zip of the full zip keeping only the staged files, size recorded -> accepted, the same files staged
    await run('I stage-zip of the full zip, staged files kept, size recorded', 'accepted, same files', async () => {
      reset({ bytes: size(zfull) });
      const i = await S.stageZip({ row: SYNTH, zip: zfull, keeps: rels, root: R, env: {} });
      const { ent, row } = readRec();
      const ok = i.ok === true && i.files === rels.length && ent.archive.members === rels.length + 1 && rels.every((r) => ent.files[r]?.sha256 === files0[r].sha256)
        && S.archiveAgreement(row, ent, { root: R }).length === 0;
      return { zip: SYNTH_NAME, bytes: size(zfull), ok, stageZip: { ok: i.ok, files: i.files, members: i.members, problems: i.problems } };
    });
    // J: the agreement term on the records root's real records, then 5 hand edits (status() FAILs A-sources-staged and
    // check.mjs FAILs third-party on these)
    await run('J agreement term: the real records agree; 5 hand edits caught', '0 real disagreements, 5/5 caught', async () => {
      const lock = JSON.parse(lockText), man = JSON.parse(manText);
      const rowOf = (id) => man.rows.find((r) => r.id === id);
      const real = Object.keys(lock.sources).map((id) => ({ id, d: S.archiveAgreement(rowOf(id), lock.sources[id], { root }) }));
      const tam = [];
      { const e = synthEntry({ bytes: 1234 }); e.archive.name = 'other.zip'; tam.push({ edit: 'synthetic: lock archive.name -> other.zip', d: S.archiveAgreement(synthRow({ bytes: 1234 }), e, { root: null }), want: 'archive name' }); }
      { const r = synthRow({ bytes: 1235 }); tam.push({ edit: 'synthetic: row archive_bytes + 1', d: S.archiveAgreement(r, synthEntry({ bytes: 1234 }), { root: null }), want: 'archive size' }); }
      { const e = synthEntry(), r = synthRow(); e.archive.sha256 = r.archive_sha256 = 'f'.repeat(64); tam.push({ edit: 'synthetic: the same made-up SHA-256 in lock and row, no size / listing', d: S.archiveAgreement(r, e, { root: R }), want: 'not tied to the upstream archive' }); }
      { const r = synthRow(); r.archive_sha256 = 'e'.repeat(64); tam.push({ edit: 'synthetic: SHA-256 in the row only', d: S.archiveAgreement(r, synthEntry(), { root: R }), want: 'archive SHA-256' }); }
      const pinned = Object.keys(S.PLAN_BYTES).find((id) => lock.sources[id] && rowOf(id));
      if (pinned) {
        const e = JSON.parse(JSON.stringify(lock.sources[pinned])), r = JSON.parse(JSON.stringify(rowOf(pinned)));
        e.archive.bytes = r.archive_bytes = 1066685;
        tam.push({ edit: `${pinned}: lock AND row size both moved to a re-zip's size`, d: S.archiveAgreement(r, e, { root }), want: 'plan §10.1' });
      }
      const ok = real.every((x) => !x.d.length) && tam.length === 5 && tam.every((t) => t.d.some((d) => d.includes(t.want)));
      return { ok, realSources: real.length, realDisagreements: real.filter((x) => x.d.length), tampered: tam.map((t) => ({ edit: t.edit, caught: t.d.some((d) => d.includes(t.want)) })),
        ...(pinned ? {} : { why: 'no plan-§10.1-pinned source in the records' }) };
    });
    // K: record-per-file (the UAL1 ruling path) refuses without its ruling, records the per-file manifest with it
    await run('K record-per-file: refused without its ruling; with it, the per-file manifest is recorded in lock + row', 'refused, then recorded', async () => {
      reset();
      const lockK = fileSha(LOCKF), manK = fileSha(MANF);
      const k1 = await S.recordPerFile({ row: SYNTH, root: R, env: { R5_SRC: stagedRoot } });
      const refusedK = k1.ok === false && (k1.problems || []).some((p) => p.includes(`archive-per-file-${SYNTH}`)) && fileSha(LOCKF) === lockK && fileSha(MANF) === manK;
      reset({ ruling: `archive-per-file-${SYNTH}=accepted` });
      const k2 = await S.recordPerFile({ row: SYNTH, root: R, env: { R5_SRC: stagedRoot } });
      const { ent, row } = readRec();
      const want = S.manifestSha256(rels.map((r) => ({ path: r, sha256: files0[r].sha256 })));
      const ok = refusedK && k2.ok === true && ent.archive.kind === 'file-manifest' && ent.archive.sha256 === want && row.archive_sha256 === want && !row.pending
        && /per-file/.test(row.archive_note || '') && S.archiveAgreement(row, ent, { root: R }).length === 0;
      return { ok, withoutRuling: { ok: k1.ok, problems: k1.problems }, withRuling: { ok: k2.ok, sha256: k2.sha256?.slice(0, 12), files: k2.files } };
    });
  } catch (e) {
    setupError = String(e?.stack || e).split('\n').slice(0, 3).join(' | ');
  } finally { rmSync(R, { recursive: true, force: true }); }
  const passed = cases.filter((c) => c.ok === true).length;
  return { ok: !setupError && cases.length === N_CASES && passed === N_CASES, records: label, row: SYNTH, passed, of: N_CASES, ...(setupError ? { error: setupError } : {}), cases };
}

/**
 * The POST-FETCH records (regression control, fix round 4): a scratch records root holding `root`'s lock, rows and
 * plan, shaped as the W0b re-fetch will leave them —
 *   ubc-standard, mco-fantasy-standard: restore --zip recorded (the plan §10.1 size, a SHA-256, members beyond the
 *                                       staged files, the listing file under tools/build/sources.listings + its hash)
 *   ual2-standard:                      the same under <!-- r5-ruling archive-size-ual2-standard=first-fetch -->
 *                                       (a size inside the lock's approxBytes window, bytesFrom)
 *   ual1:                               `ual1: 'per-file'` (default): record-per-file under
 *                                       <!-- r5-ruling archive-per-file-ual1=accepted --> (kind file-manifest, the per-file
 *                                       manifest hash, archive_note); `ual1: 'first-fetch'`: restore --zip under
 *                                       <!-- r5-ruling archive-size-ual1=first-fetch --> (a v1 archive from a backup)
 * The archive hashes and listings are SIMULATED (no archive is on this machine); the shape is the one the code writes.
 * Precondition: archiveAgreement is [] on every shaped source (the records a real fetch writes agree).
 */
export async function postFetchRecords({ root = ROOT, codeRoot = ROOT, out, ual1 = 'per-file' }) {
  const S = await loadS(codeRoot);
  rmSync(out, { recursive: true, force: true });
  for (const f of [S.LOCK, 'public/LICENSES.json', S.PLAN]) mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  mkdirSync(path.join(out, S.LISTINGS), { recursive: true });
  // real listings (a source the re-fetch already recorded keeps its real record and listing)
  if (existsSync(path.join(root, S.LISTINGS))) cpSync(path.join(root, S.LISTINGS), path.join(out, S.LISTINGS), { recursive: true });
  const lock = S.loadLock(root);
  const man = JSON.parse(readFileSync(path.join(root, 'public/LICENSES.json'), 'utf8'));
  const today = '2026-10-22';
  const shaped = {};
  for (const [id, ent] of Object.entries(lock.sources)) {
    const row = man.rows.find((r) => r.id === id);
    if (!row) continue;
    if (ent.archive?.sha256) { shaped[id] = 'already recorded (real record kept)'; continue; }
    delete row.pending;
    if (id === 'ual1' && ual1 === 'per-file') {
      const manifest = S.manifestSha256(Object.entries(ent.files).map(([rel, rec]) => ({ path: rel, sha256: rec.sha256 })));
      ent.archive = { ...ent.archive, kind: 'file-manifest', sha256: manifest, ruling: 'archive-per-file-ual1=accepted', retrieved: ent.archive.retrieved || today };
      delete ent.stagedFrom;
      Object.assign(row, { archive_sha256: manifest, retrieved: ent.archive.retrieved,
        archive_note: `per-file SHA-256 manifest of the ${Object.keys(ent.files).length} staged files (ruling archive-per-file-ual1=accepted): the upstream archive of this version can no longer be fetched` });
      shaped[id] = 'record-per-file';
      continue;
    }
    const lines = [...Object.entries(ent.files).map(([rel, rec]) => `${rec.bytes}\t00000000\tPack/${rel}`),
      ...Array.from({ length: 5 }, (_, i) => `${100 + i}\t00000000\tPack/Unstaged/member-${i}.bin`)].sort();
    const text = `${lines.join('\n')}\n`;
    writeFileSync(path.join(out, S.LISTINGS, `${id}.tsv`), text);
    const window = ent.archive.approxBytes;
    const bytes = ent.archive.bytes ?? (window ? Math.round((window.min + window.max) / 2) : ent.totalBytes + 1000000);
    ent.archive = { ...ent.archive, bytes, ...(ent.archive.bytes == null ? { bytesFrom: `first fetch (ruling archive-size-${id}=first-fetch)` } : {}),
      sha256: sha(`simulated upstream archive ${id}`), members: lines.length, listingSha256: sha(Buffer.from(text)), retrieved: today };
    delete ent.stagedFrom;
    ent.verifiedAgainstArchive = true;
    Object.assign(row, { archive_sha256: ent.archive.sha256, archive_bytes: bytes, archive_name: ent.archive.name, retrieved: today });
    shaped[id] = ent.archive.bytesFrom ? 'restore --zip, first-fetch ruling' : 'restore --zip, recorded size';
  }
  writeFileSync(path.join(out, S.LOCK), `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(path.join(out, 'public/LICENSES.json'), `${JSON.stringify(man, null, 2)}\n`);
  const ual1Ruling = ual1 === 'per-file' ? 'archive-per-file-ual1=accepted' : 'archive-size-ual1=first-fetch';
  writeFileSync(path.join(out, S.PLAN), `${readFileSync(path.join(root, S.PLAN), 'utf8')}\n<!-- r5-ruling ${ual1Ruling} -->\n<!-- r5-ruling archive-size-ual2-standard=first-fetch -->\n`);
  const agreement = Object.keys(shaped).map((id) => ({ id, d: S.archiveAgreement(man.rows.find((r) => r.id === id), lock.sources[id], { root: out }) }));
  return { root: out, shaped, agree: agreement.every((x) => !x.d.length), disagreements: agreement.filter((x) => x.d.length) };
}

/**
 * The regression control: the same suite on the post-fetch records. ok === true needs the shape to agree AND N/N cases.
 * `ual1`: 'per-file' (record-per-file under archive-per-file-ual1=accepted) or 'first-fetch' (a v1 archive from a backup,
 * restore --zip under archive-size-ual1=first-fetch — round 3's suite threw ENOENT there); A-sources-staged runs both.
 */
export async function archiveControlsPostFetch({ root = ROOT, codeRoot = ROOT, scratch = DEFAULT_SCRATCH, ual1 = 'per-file' } = {}) {
  mkdirSync(scratch, { recursive: true });
  const out = path.join(realpathSync(scratch), `post-fetch-records-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const shape = await postFetchRecords({ root, codeRoot, out, ual1 });
    const r = await archiveControls({ root: out, codeRoot, scratch, label: `post-fetch records (simulated; ual1 ${ual1})` });
    return { ...r, ok: shape.agree && r.ok === true, shape: { shaped: shape.shaped, agree: shape.agree, disagreements: shape.disagreements } };
  } finally { rmSync(out, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--scratch');
  const opt = i >= 0 ? { scratch: a[i + 1] } : {};
  const current = await archiveControls(opt);
  const postFetch = await archiveControlsPostFetch(opt);
  const postFetchUal1Archive = await archiveControlsPostFetch({ ...opt, ual1: 'first-fetch' });
  const ok = current.ok && postFetch.ok && postFetchUal1Archive.ok;
  console.log(JSON.stringify({ ok, current, postFetch, postFetchUal1Archive }));
  if (!ok) process.exitCode = 1;
}
