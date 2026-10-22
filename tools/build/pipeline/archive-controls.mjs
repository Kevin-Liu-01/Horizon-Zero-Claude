#!/usr/bin/env node
/**
 * A-sources-staged — the ARCHIVE IDENTITY controls (pipeline lane, W0b fix round 3).
 *
 * Judge (W0b r0): "restore --zip and verify-zip record any zip's hash as the upstream archive's, so a self-made zip
 * passes the gates" (zipping public/anims into ual1.zip was recorded as UAL1's archive). These controls prove the
 * refusal on the real code path, in scratch, with zips built from a source that IS staged on this machine:
 *
 *   A  re-zip of exactly the staged files, recorded name, no recorded size, no ruling  -> restore AND verify-zip refuse
 *   B  the same re-zip after a forger set the recorded size to its size (lock + row)     -> refused: subset only
 *   C  a full zip (staged files + one more member) under a different file name           -> refused: name
 *   D  a full zip with one staged member changed by one byte (size recorded)            -> refused: mismatched member
 *   E  a full zip, no recorded size, ruling archive-size-<row>=first-fetch in the plan   -> accepted: hash, size
 *                                                                                           (bytesFrom), members,
 *                                                                                           listing recorded
 *   F  after E, the subset re-zip again                                                 -> refused (hash, subset)
 *   G  a full zip whose size equals the recorded size, --delete-zip                     -> accepted, zip deleted
 *   H  stage-zip of the subset re-zip keeping every member, recorded size forged         -> refused (not a trimmed
 *                                                                                           subset)
 *   I  stage-zip of the full zip keeping the staged files, recorded size                -> accepted, same files
 *   E' (after E) the recorded lock/row pair agrees (`archiveAgreement`), an edited member listing is caught
 *   K  record-per-file (UAL1's ruling path): refused without <!-- r5-ruling archive-per-file-<row>=accepted -->,
 *      with it the per-file SHA-256 manifest is recorded in the lock and the row (`archive_note` says why)
 *   J  `archiveAgreement` on the real lock/rows: 0 disagreements; 5 hand edits (lock name, row size, a made-up hash in
 *      both, a hash in the row only, lock + row size both moved off the plan's §10.1 size) all caught — the term
 *      status() and tools/licences/check.mjs FAIL on
 *
 * Every refused case must leave the scratch lock, the scratch LICENSES.json and the scratch r5-src untouched. The
 * scratch root holds copies of tools/build/sources.lock.json, public/LICENSES.json and a plan whose only ruling lines
 * are the ones a case adds, so the result never depends on rulings in the real plan. Nothing in the repository is
 * written: restore/verifyZip take `root` (and `env: {}` so R5_SRC can never point them at the real r5-src).
 *
 *   node tools/build/pipeline/archive-controls.mjs [--scratch <dir>]   -> one JSON line { ok, row, cases }
 */
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, copyFileSync, realpathSync, appendFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const fileSha = (f) => (existsSync(f) ? sha(readFileSync(f)) : null);

export async function archiveControls({ root = ROOT, scratch = path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline') } = {}) {
  const S = await import(pathToFileURL(path.join(root, 'tools/build/sources.mjs')).href);
  const lock = S.loadLock(root);
  const realSrc = S.srcDir(root, {});
  // a source whose staged files are all on disk (after the Oct 22 reboot: ual1)
  const pick = ['ual1', ...Object.keys(lock.sources)].find((id) => {
    const e = lock.sources[id];
    return e && e.archive?.kind !== 'file-manifest' && e.archive?.name && Object.keys(e.files).every((f) => existsSync(path.join(realSrc, e.dir || id, f)));
  });
  if (!pick) return { ok: null, why: 'no source has every staged file on disk: nothing to build the control zips from' };
  const ent0 = lock.sources[pick];
  const rels = Object.keys(ent0.files).sort();
  mkdirSync(scratch, { recursive: true });
  const R = path.join(realpathSync(scratch), `archive-control-${process.pid}`);
  rmSync(R, { recursive: true, force: true });
  const cases = [];
  try {
    const LOCKF = path.join(R, S.LOCK), MANF = path.join(R, 'public/LICENSES.json'), PLANF = path.join(R, S.PLAN);
    for (const f of [LOCKF, MANF, PLANF]) mkdirSync(path.dirname(f), { recursive: true });
    const planBase = readFileSync(path.join(root, S.PLAN), 'utf8').split('\n').filter((l) => !/<!--\s*r5-ruling\s+archive-/.test(l)).join('\n');
    const lockText = readFileSync(path.join(root, S.LOCK), 'utf8');
    const manText = readFileSync(path.join(root, 'public/LICENSES.json'), 'utf8');
    // the zips, built from the staged directory (member names = the lock's relative paths)
    const Z = path.join(R, 'zips'); mkdirSync(Z, { recursive: true });
    const stagedDir = path.join(realSrc, ent0.dir || pick);
    const zipAt = (out, cwd, members) => { mkdirSync(path.dirname(out), { recursive: true }); rmSync(out, { force: true }); execFileSync('zip', ['-X', '-q', out, ...members], { cwd }); return out; };
    const name = ent0.archive.name;
    const zsub = zipAt(path.join(Z, 'sub', name), stagedDir, rels);
    const extraDir = path.join(R, 'extra'); mkdirSync(path.join(extraDir, 'Extra'), { recursive: true });
    writeFileSync(path.join(extraDir, 'Extra/README.txt'), 'a member the trimmed subset does not keep\n');
    const zfull = path.join(Z, 'full', name);
    zipAt(zfull, stagedDir, rels); execFileSync('zip', ['-X', '-q', zfull, 'Extra/README.txt'], { cwd: extraDir });
    const modDir = path.join(R, 'mod');
    execFileSync('cp', ['-cR', stagedDir, modDir]);
    appendFileSync(path.join(modDir, rels[0]), 'x');
    const zbad = path.join(Z, 'bad', name);
    zipAt(zbad, modDir, rels); execFileSync('zip', ['-X', '-q', zbad, 'Extra/README.txt'], { cwd: extraDir });
    const size = (f) => statSync(f).size;

    const reset = ({ bytes = undefined, ruling = null } = {}) => {
      rmSync(path.join(R, 'models-staging'), { recursive: true, force: true });
      rmSync(path.join(R, S.LISTINGS), { recursive: true, force: true });
      const l = JSON.parse(lockText), m = JSON.parse(manText);
      if (bytes !== undefined) {
        l.sources[pick].archive.bytes = bytes;
        const row = m.rows.find((r) => r.id === pick);
        if (bytes == null) delete row.archive_bytes; else row.archive_bytes = bytes;
      }
      writeFileSync(LOCKF, `${JSON.stringify(l, null, 2)}\n`);
      writeFileSync(MANF, `${JSON.stringify(m, null, 2)}\n`);
      writeFileSync(PLANF, ruling ? `${planBase}\n<!-- r5-ruling ${ruling} -->\n` : planBase);
    };
    const snap = () => ({ lock: fileSha(LOCKF), man: fileSha(MANF), staged: existsSync(path.join(R, S.SRC_REL, ent0.dir || pick)), listing: existsSync(path.join(R, S.LISTINGS, `${pick}.tsv`)) });
    const refused = async (label, zip, { want, expectMismatch = false } = {}) => {
      const before = snap();
      const r = await S.restore({ row: pick, zip, root: R, env: {} });
      const v = await S.verifyZip({ row: pick, zip, root: R });
      const after = snap();
      const probs = [...(r.problems || []), ...(r.mismatched || []).map((m) => `mismatched ${m.rel}`)];
      const vprobs = [...(v.problems || []), ...(v.mismatched || []).map((m) => `mismatched ${m.rel}`)];
      const untouched = before.lock === after.lock && before.man === after.man && !after.staged && !after.listing;
      const hit = (ps) => want.every((w) => ps.some((p) => p.includes(w)));
      const ok = r.ok === false && v.ok === false && untouched && hit(probs) && (expectMismatch ? hit(vprobs) : hit(vprobs));
      cases.push({ case: label, zip: path.basename(zip), bytes: size(zip), expect: 'refused', ok, restore: { ok: r.ok, problems: probs.slice(0, 4) },
        verifyZip: { ok: v.ok, problems: vprobs.slice(0, 4) }, lockAndRowUntouched: untouched });
    };

    reset();
    await refused('A re-zip of the staged subset (no recorded size, no ruling)', zsub, { want: ['no byte size is recorded', 'holds only the'] });
    reset({ bytes: size(zsub) });
    await refused('B re-zip of the staged subset, recorded size forged to match', zsub, { want: ['holds only the'] });
    const wrong = path.join(Z, 'full', `${pick}.zip`); copyFileSync(zfull, wrong);
    reset({ bytes: size(wrong) });
    await refused('C full zip under another file name', wrong, { want: [`archive file name "${pick}.zip"`] });
    reset({ bytes: size(zbad) });
    await refused('D full zip with one staged member changed', zbad, { want: [`mismatched ${rels[0]}`], expectMismatch: true });

    // E: positive under the ruling (no recorded size)
    reset({ bytes: null, ruling: `archive-size-${pick}=first-fetch` });
    const e = await S.restore({ row: pick, zip: zfull, root: R, env: {} });
    const le = JSON.parse(readFileSync(LOCKF, 'utf8')).sources[pick].archive;
    const re = JSON.parse(readFileSync(MANF, 'utf8')).rows.find((r) => r.id === pick);
    const lst = path.join(R, S.LISTINGS, `${pick}.tsv`);
    const okE = e.ok === true && e.recorded === true && le.sha256 === fileSha(zfull) && le.bytes === size(zfull) && /first fetch/.test(le.bytesFrom || '')
      && le.members === rels.length + 1 && existsSync(lst) && fileSha(lst) === le.listingSha256 && le.name === name
      && re.archive_sha256 === le.sha256 && re.archive_bytes === le.bytes && re.archive_name === name && !re.pending;
    cases.push({ case: 'E full zip, no recorded size, ruling archive-size first-fetch', zip: name, bytes: size(zfull), expect: 'accepted + recorded', ok: okE,
      restore: { ok: e.ok, recorded: e.recorded, problems: e.problems }, recorded: { sha256: le.sha256?.slice(0, 12), bytes: le.bytes, bytesFrom: le.bytesFrom, members: le.members, listing: existsSync(lst) } });
    // E': the recorded pair agrees (status / check.mjs term), and a changed listing file is caught
    const entE = JSON.parse(readFileSync(LOCKF, 'utf8')).sources[pick];
    const agreeE = S.archiveAgreement(re, entE, { root: R });
    const lstText = readFileSync(lst);
    appendFileSync(lst, '1\t00000000\tforged-member\n');
    const agreeE2 = S.archiveAgreement(re, entE, { root: R });
    writeFileSync(lst, lstText);
    cases.push({ case: "E' recorded pair agrees; an edited member listing is caught", expect: '[] then caught', ok: agreeE.length === 0 && agreeE2.some((d) => d.includes('does not hash')),
      agreement: { recorded: agreeE, listingEdited: agreeE2 } });
    // F: the subset re-zip after the record exists
    const lockE = fileSha(LOCKF), manE = fileSha(MANF);
    const f = await S.restore({ row: pick, zip: zsub, root: R, env: {} });
    const okF = f.ok === false && (f.problems || []).some((p) => p.startsWith('archive SHA-256')) && (f.problems || []).some((p) => p.includes('holds only the')) && fileSha(LOCKF) === lockE && fileSha(MANF) === manE;
    cases.push({ case: 'F subset re-zip after the hash is recorded', zip: name, bytes: size(zsub), expect: 'refused', ok: okF, restore: { ok: f.ok, problems: f.problems || [] } });
    // G: positive with the size recorded (the UBC / MCO path), --delete-zip
    const zg = path.join(Z, 'g', name); mkdirSync(path.dirname(zg), { recursive: true }); copyFileSync(zfull, zg);
    reset({ bytes: size(zg) });
    const g = await S.restore({ row: pick, zip: zg, root: R, env: {}, deleteZip: true });
    const lg = JSON.parse(readFileSync(LOCKF, 'utf8')).sources[pick].archive;
    const okG = g.ok === true && g.recorded === true && g.zipDeleted === true && !existsSync(zg) && lg.bytes === size(zfull) && !lg.bytesFrom && lg.members === rels.length + 1;
    cases.push({ case: 'G full zip, recorded size, --delete-zip', zip: name, bytes: size(zfull), expect: 'accepted + zip deleted', ok: okG, restore: { ok: g.ok, recorded: g.recorded, zipDeleted: g.zipDeleted, problems: g.problems } });
    // H: stage-zip (re-stage) of the subset re-zip with every member kept, size forged to match -> refused
    reset({ bytes: size(zsub) });
    const lockH = fileSha(LOCKF), manH = fileSha(MANF);
    const h = await S.stageZip({ row: pick, zip: zsub, keeps: [], root: R, env: {} });
    const okH = h.ok === false && (h.problems || []).some((p) => p.includes('select all')) && fileSha(LOCKF) === lockH && fileSha(MANF) === manH
      && !existsSync(path.join(R, S.SRC_REL, ent0.dir || pick));
    cases.push({ case: 'H stage-zip of the subset re-zip, keep-all, size forged', zip: name, bytes: size(zsub), expect: 'refused', ok: okH, stageZip: { ok: h.ok, problems: h.problems } });
    // I: stage-zip of the full zip keeping only the staged files, size recorded -> accepted, the same files staged
    reset({ bytes: size(zfull) });
    const i = await S.stageZip({ row: pick, zip: zfull, keeps: rels, root: R, env: {} });
    const li = JSON.parse(readFileSync(LOCKF, 'utf8')).sources[pick];
    const okI = i.ok === true && i.files === rels.length && li.archive.members === rels.length + 1 && rels.every((r) => li.files[r]?.sha256 === ent0.files[r].sha256);
    cases.push({ case: 'I stage-zip of the full zip, staged files kept, size recorded', zip: name, bytes: size(zfull), expect: 'accepted, same files', ok: okI, stageZip: { ok: i.ok, files: i.files, members: i.members, problems: i.problems } });
    // J: the agreement term on hand-edited records (status() FAILs A-sources-staged and check.mjs FAILs third-party on these)
    const man = JSON.parse(manText);
    const rowOf = (id) => man.rows.find((r) => r.id === id);
    const real = Object.keys(lock.sources).map((id) => ({ id, d: S.archiveAgreement(rowOf(id), lock.sources[id], { root }) }));
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const tam = [];
    const named = Object.keys(lock.sources).find((id) => lock.sources[id].archive?.bytes != null) || pick;
    { const e = clone(lock.sources[named]); e.archive.name = 'other.zip'; tam.push({ edit: `${named}: lock archive.name -> other.zip`, d: S.archiveAgreement(rowOf(named), e, { root }), want: 'archive name' }); }
    { const r = clone(rowOf(named)); r.archive_bytes = (r.archive_bytes ?? 0) + 1; tam.push({ edit: `${named}: row archive_bytes + 1`, d: S.archiveAgreement(r, lock.sources[named], { root }), want: 'archive size' }); }
    { const e = clone(lock.sources[pick]), r = clone(rowOf(pick)); e.archive.sha256 = r.archive_sha256 = 'f'.repeat(64); tam.push({ edit: `${pick}: the same made-up SHA-256 in lock and row, no size / listing`, d: S.archiveAgreement(r, e, { root }), want: 'not tied to the upstream archive' }); }
    { const r = clone(rowOf(pick)); r.archive_sha256 = 'e'.repeat(64); tam.push({ edit: `${pick}: SHA-256 in the row only`, d: S.archiveAgreement(r, lock.sources[pick], { root }), want: 'archive SHA-256' }); }
    const pinned = Object.keys(S.PLAN_BYTES).find((id) => lock.sources[id] && rowOf(id));
    if (pinned) { const e = clone(lock.sources[pinned]), r = clone(rowOf(pinned)); e.archive.bytes = r.archive_bytes = 1066685; tam.push({ edit: `${pinned}: lock AND row size both moved to a re-zip's size`, d: S.archiveAgreement(r, e, { root }), want: 'plan §10.1' }); }
    const okJ = real.every((x) => !x.d.length) && tam.every((t) => t.d.some((d) => d.includes(t.want)));
    cases.push({ case: `J agreement term: the real records agree; ${tam.length} hand edits caught`, expect: `0 real disagreements, ${tam.length}/${tam.length} caught`, ok: okJ && tam.length === 5,
      realDisagreements: real.filter((x) => x.d.length), tampered: tam.map((t) => ({ edit: t.edit, caught: t.d.some((d) => d.includes(t.want)) })) });
    // K: record-per-file (the UAL1 ruling path) refuses without its ruling, records the per-file manifest with it
    reset({ bytes: null });
    const lockK = fileSha(LOCKF);
    const k1 = await S.recordPerFile({ row: pick, root: R, env: { R5_SRC: realSrc } });
    const refusedK = k1.ok === false && (k1.problems || []).some((p) => p.includes(`archive-per-file-${pick}`)) && fileSha(LOCKF) === lockK;
    reset({ bytes: null, ruling: `archive-per-file-${pick}=accepted` });
    const k2 = await S.recordPerFile({ row: pick, root: R, env: { R5_SRC: realSrc } });
    const lk = JSON.parse(readFileSync(LOCKF, 'utf8')).sources[pick];
    const rk = JSON.parse(readFileSync(MANF, 'utf8')).rows.find((r) => r.id === pick);
    const want = S.manifestSha256(rels.map((r) => ({ path: r, sha256: ent0.files[r].sha256 })));
    const okK = refusedK && k2.ok === true && lk.archive.kind === 'file-manifest' && lk.archive.sha256 === want && rk.archive_sha256 === want && !rk.pending
      && /per-file/.test(rk.archive_note || '') && S.archiveAgreement(rk, lk, { root: R }).length === 0;
    cases.push({ case: 'K record-per-file: refused without its ruling; with it, the per-file manifest is recorded in lock + row', expect: 'refused, then recorded', ok: okK,
      withoutRuling: { ok: k1.ok, problems: k1.problems }, withRuling: { ok: k2.ok, sha256: k2.sha256?.slice(0, 12), files: k2.files } });
  } finally { rmSync(R, { recursive: true, force: true }); }
  return { ok: cases.length === 12 && cases.every((c) => c.ok), row: pick, stagedFiles: rels.length, cases };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const i = a.indexOf('--scratch');
  const r = await archiveControls(i >= 0 ? { scratch: a[i + 1] } : {});
  console.log(JSON.stringify(r));
  if (r.ok === false) process.exitCode = 1;
}
