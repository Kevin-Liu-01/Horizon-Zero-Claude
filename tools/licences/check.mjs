/**
 * A-licence-manifest (pipeline lane; plan §9 pipeline, §10) — node check.
 *
 *   node tools/licences/check.mjs            prints the report, exit 1 on FAIL
 *
 * Clauses (each reported PASS / PENDING / FAIL with its evidence):
 *   files-matched     every file under public/ the repo ships (tracked or
 *                     untracked-not-ignored) matches exactly one row; files
 *                     git ignores are listed as `ignoredOnDisk`; a file
 *                     with no row is PENDING (never PASS) only while it is a
 *                     valid `rowless` scheduled exception (an R30 file another
 *                     lane deletes this wave with its reader class), else FAIL
 *   row-schema        unique ids; SPDX licence from the allowed set (MIT only
 *                     for code rows, i.e. rows whose paths are not public/);
 *                     attribution on every CC-BY and MIT row and source_url on
 *                     every non-project-original row, `ip: true` rows included
 *                     (add.mjs validateRow, no exemption); no NC/ND
 *   third-party       every non-legacy third-party asset row has source_url,
 *                     archive_sha256 and retrieved (PENDING while the row
 *                     names the W0b re-fetch in `pending`); a row with a
 *                     tools/build/sources.lock.json entry must agree with it
 *                     (archive sha, name, size), and a recorded hash must carry
 *                     the size + member listing beyond the staged subset —
 *                     else FAIL (fix round 3: no self-made zip's hash passes)
 *   legacy-source     every legacy row has an established source and a
 *                     CC0 / CC-BY / OFL / project-original licence. A row
 *                     marked `ip: true` (or declaring IP provenance) is NEVER
 *                     accepted: while one matches a shipped file the clause is
 *                     PENDING if every such file is a currently valid
 *                     scheduled exception (lib.mjs SCHEDULED_IP: same
 *                     deadline in the row, deadline not reached, replacement
 *                     not landed) and FAIL otherwise — so the gate cannot PASS
 *                     with IP on disk
 *   code-rows         MIT rows for three, three-mesh-bvh, the meshopt decoder
 *   licence-texts     every licence_text path exists
 *   credits           every CC-BY / MIT attribution appears verbatim in the
 *                     README "Credits" section and in the RENDERED in-game
 *                     credits: the text of the credits modal as the page
 *                     shows it after its CREDITS button is clicked (W0b fix
 *                     round 1 — the source text of menu.js is never read, so
 *                     a comment cannot satisfy it). The node CLI cannot see a
 *                     page: there the in-game half is "not graded" and the
 *                     clause is at best PENDING; the A-licence-manifest gate
 *                     (tools/gates.r5.pipeline.mjs) grades it in page context
 *                     with the same `gradeCredits` function. A surface that
 *                     shows NONE of the attributions is "not wired yet"
 *                     (brand, W0b): PENDING before the W0 exit, FAIL from it
 *                     (`w0ExitReached`: the wave, the R39 hero swap, or
 *                     aloy.glb gone — fix round 5); a surface that shows
 *                     some but not all is FAIL (drift)
 *   size              du public/ <= 60 MB
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, ASSET_LICENCES, CODE_LICENCES, NEEDS_ATTRIBUTION, FORBIDDEN_LICENCE, IP_PATTERN,
  loadManifest, listShipped, listIgnored, matchRows, duBytes,
  currentWave, loadSpecs, scheduledStatus, rowProvenanceText, SCHEDULED_IP, waveRank,
} from './lib.mjs';
import { validateRow } from './add.mjs';
import { archiveAgreement } from '../build/sources.mjs';

export const PUBLIC_CAP_BYTES = 60 * 1024 * 1024;
const CODE_ROW_IDS = ['code-three', 'code-three-mesh-bvh', 'code-meshopt-decoder'];
const LOCK_REL = 'tools/build/sources.lock.json';

/** The README "Credits" section text (from its heading to the next h2), or ''. */
export function readmeCredits(root = ROOT) {
  const f = path.join(root, 'README.md');
  if (!existsSync(f)) return '';
  const text = readFileSync(f, 'utf8');
  const m = /^##\s+Credits\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
  return m ? m[1] : '';
}

/**
 * The credits clause, as ONE pure function (no imports, no closure): check.mjs
 * calls it in node and the A-licence-manifest page gate embeds its source
 * (`gradeCredits.toString()`) and calls it on the rendered modal text.
 *   need          [{ id, licence, attribution }] (credits.mjs requiredAttributions)
 *   readmeText    the README "## Credits" section text ('' if absent)
 *   rendered      null (not graded here) | { visible, how, text, error? }
 *   atOrPastW0Exit  true when the wave is the W0 exit or later (a surface showing none is then FAIL)
 */
export function gradeCredits({ need, readmeText, rendered, atOrPastW0Exit }) {
  const norm = (t) => String(t ?? '').replace(/\s+/g, ' ');
  const surface = (text) => {
    const t = norm(text);
    const missing = need.filter((r) => !t.includes(norm(r.attribution))).map((r) => r.id);
    const shown = need.length - missing.length;
    const status = !missing.length ? 'PASS' : shown === 0 ? (atOrPastW0Exit ? 'FAIL' : 'PENDING') : 'FAIL';
    return { status, shown, of: need.length, missing };
  };
  const readme = surface(readmeText);
  let inGame;
  if (!rendered) inGame = { status: 'PENDING', graded: false, why: 'not graded here: the in-game half is graded only on the rendered credits modal (A-licence-manifest page gate)' };
  else if (rendered.error || !rendered.visible) inGame = { status: 'FAIL', graded: true, why: `the credits modal did not render: ${rendered.error || 'not visible'}`, how: rendered.how ?? null };
  else inGame = { graded: true, how: rendered.how, chars: norm(rendered.text).length, ...surface(rendered.text) };
  const all = [readme.status, inGame.status];
  const status = all.includes('FAIL') ? 'FAIL' : all.includes('PENDING') ? 'PENDING' : 'PASS';
  return {
    status, attributions: need.length, readme, inGame,
    ...(status === 'PENDING' ? { owner: 'brand W0b: node tools/lint/credits-sync.mjs (README "## Credits" + menu.js CREDITS from tools/licences/credits.mjs)' } : {}),
  };
}

/**
 * Is the repository at or past the W0 exit, where a credits surface that shows NONE of the attributions is a
 * FAIL (not "not wired yet")? W0b fix round 5 (judge: on main, with no lane branch and no R5_WAVE, the wave is
 * only a lane-report lower bound, so the exit run would have printed PENDING on 0/9). Any ONE signal is enough:
 *   - the wave (R5_WAVE, the lane branch, OR the lane-report lower bound: a lower bound at or past the exit is
 *     sound, since the true wave can only be later);
 *   - SPECS.hero no longer names the Round-4 body: the R39 hero swap merges in the W0-exit window;
 *   - public/models/aloy.glb is gone: hero-body deletes it at the W0 exit (plan §6).
 * Returns { reached, signals: [why...] }.
 */
export function w0ExitReached({ wave, specs, root = ROOT }) {
  const signals = [];
  if (wave?.wave && waveRank(wave.wave) >= waveRank('W0 exit')) signals.push(`wave ${wave.wave} (${wave.source})`);
  const hero = specs?.hero?.url ?? null;
  if (hero && hero !== '/models/aloy.glb') signals.push(`SPECS.hero is ${hero}: the R39 hero swap merges in the W0-exit window`);
  if (!existsSync(path.join(root, 'public/models/aloy.glb'))) signals.push('public/models/aloy.glb is gone: hero-body deletes it at the W0 exit (plan §6)');
  return { reached: signals.length > 0, signals };
}

/**
 * NEGATIVE CONTROL of the exit rule (no files read): a README and a rendered modal that show none of the
 * attributions must grade FAIL once the exit is signalled by the hero swap alone (wave W0b, aloy.glb present),
 * and PENDING before it. A credits clause whose control fails is a FAIL.
 */
export function creditsExitControl(need) {
  const n = need?.length ? need : [{ id: 'control', licence: 'CC-BY-4.0', attribution: 'control attribution' }];
  const wave = { wave: 'W0b', source: 'control', exact: true };
  const here = { root: ROOT };
  const swapped = w0ExitReached({ wave, specs: { hero: { url: '/models/hero/brea.glb' } }, ...here });
  const notYet = w0ExitReached({ wave, specs: { hero: { url: '/models/aloy.glb' } }, ...here });
  const aloyOnDisk = existsSync(path.join(ROOT, 'public/models/aloy.glb'));
  const empty = { visible: true, how: 'control', text: '' };
  const atExit = gradeCredits({ need: n, readmeText: '', rendered: empty, atOrPastW0Exit: swapped.reached }).status;
  const before = gradeCredits({ need: n, readmeText: '', rendered: empty, atOrPastW0Exit: notYet.reached }).status;
  // with aloy.glb gone from this tree the "before" case is itself past the exit (FAIL is then correct too)
  const ok = swapped.reached && atExit === 'FAIL' && (aloyOnDisk ? before === 'PENDING' : before === 'FAIL');
  return { ok, heroSwappedAtW0b: atExit, heroNotSwappedAtW0b: before, aloyOnDisk };
}

export async function check(root = ROOT, { env = process.env, rendered = null } = {}) {
  const clauses = {};
  let creditsInput = null;
  const put = (id, status, detail) => { clauses[id] = { status, ...detail }; };
  const manifest = loadManifest(root);
  if (!manifest) {
    put('manifest', 'FAIL', { error: 'public/LICENSES.json missing' });
    return { pass: false, clauses };
  }
  const rows = manifest.rows || [];
  const files = listShipped('public', root);
  const ignoredOnDisk = listIgnored('public', root);
  const { byFile, hits } = matchRows(manifest, files);

  // files-matched. A file with no row is a FAIL, except a currently valid
  // `rowless` scheduled exception (an R30 file another lane deletes in this
  // wave with its reader class, lib.mjs SCHEDULED_IP): PENDING, by name. An
  // expired or orphaned one is unmatched, i.e. FAIL.
  const wave = currentWave(root, env);
  const specs = await loadSpecs(root);
  const unmatchedAll = files.filter((f) => !byFile.get(f).length);
  const rowlessPending = [], rowlessInvalid = [];
  for (const f of unmatchedAll) {
    if (!SCHEDULED_IP[f]?.rowless) continue;
    const st = scheduledStatus(f, [], { wave, specs, root });
    (st.valid ? rowlessPending : rowlessInvalid).push({ file: f, owner: st.owner, reader: st.reader, deadline: st.deadline, why: st.why });
  }
  const unmatched = unmatchedAll.filter((f) => !rowlessPending.some((p) => p.file === f));
  const multi = files.filter((f) => byFile.get(f).length > 1).map((f) => ({ file: f, rows: byFile.get(f) }));
  const assetRows = rows.filter((r) => (r.paths || []).some((p) => p.startsWith('public/')));
  const idle = assetRows.filter((r) => !hits.get(r.id)).map((r) => r.id);
  put('files-matched', unmatched.length || multi.length ? 'FAIL' : rowlessPending.length ? 'PENDING' : 'PASS',
    { files: files.length, unmatched, multiMatched: multi, rowsMatchingNothing: idle, ignoredOnDisk,
      pendingOtherLaneDeletions: rowlessPending, ...(rowlessInvalid.length ? { expiredOrOrphaned: rowlessInvalid } : {}),
      ...(rowlessPending.length ? { pending: 'R30 files another lane deletes in this wave (with their reader classes) ship without a row until then' } : {}) });

  // row-schema (the add.mjs validator: no exemption for ip rows)
  const bad = [];
  const seen = new Set();
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) bad.push({ id: r.id, why: 'missing or duplicate id' });
    seen.add(r.id);
    if (FORBIDDEN_LICENCE.test(String(r.licence))) bad.push({ id: r.id, why: 'NC/ND licence' });
    for (const e of validateRow(r)) bad.push({ id: r.id, why: e });
  }
  put('row-schema', bad.length ? 'FAIL' : 'PASS', { rows: rows.length, problems: bad });

  // third-party (non-legacy, not project-original, not code). W0b: a row built FROM staged sources declares
  // `derived_from: [source row ids]`; its archive record is its sources' (each graded here as its own row)
  const tp = rows.filter((r) => !r.legacy && r.licence !== 'project-original' && !CODE_LICENCES.includes(r.licence)
    || (r.legacy && r.pending));
  const missing = [], pending = [], derived = [];
  let lockSources = {};
  try { lockSources = JSON.parse(readFileSync(path.join(root, LOCK_REL), 'utf8')).sources || {}; } catch { /* no lock: rows graded alone */ }
  for (const r of tp) {
    if (Array.isArray(r.derived_from) && r.derived_from.length) {
      const srcs = r.derived_from.map((id) => rows.find((x) => x.id === id));
      const bad = r.derived_from.filter((id, i) => !srcs[i] || !srcs[i].source_url || srcs[i].derived_from);
      if (bad.length) missing.push({ id: r.id, missing: [`derived_from source row(s) absent or not a source: ${bad.join(', ')}`] });
      else derived.push({ id: r.id, from: r.derived_from });
      continue;
    }
    // fix round 3: the row and the staging lock must name the same upstream archive (sha, name, size), and a recorded
    // hash must carry the size + member listing that tie it to that archive (a re-zip of the trimmed subset cannot)
    const ent = lockSources[r.id];
    if (ent) {
      const dis = archiveAgreement(r, ent, { root });
      if (dis.length) { missing.push({ id: r.id, missing: dis.map((d) => `disagrees with ${LOCK_REL}: ${d}`) }); continue; }
    }
    const need = ['source_url', 'archive_sha256', 'retrieved'].filter((k) => !r[k]);
    if (!need.length) continue;
    if (r.pending) pending.push({ id: r.id, missing: need, pending: r.pending });
    else missing.push({ id: r.id, missing: need });
  }
  put('third-party', missing.length ? 'FAIL' : pending.length ? 'PENDING' : 'PASS', { rows: tp.length, missing, pending, derived });

  // legacy-source
  const rowFiles = (r) => files.filter((f) => byFile.get(f).includes(r.id));
  const leg = rows.filter((r) => r.legacy);
  const legBad = [];
  for (const r of leg) {
    if (r.ip === true) continue;                                   // graded below, never accepted
    if (!r.source_url) legBad.push({ id: r.id, why: 'no source_url' });
    if (!ASSET_LICENCES.includes(r.licence)) legBad.push({ id: r.id, why: `licence ${r.licence}` });
    if (!r.delete_at) legBad.push({ id: r.id, why: 'no delete_at wave' });
  }
  // IP rows (flagged, or declaring IP provenance): a shipped file under one is
  // at best a scheduled exception (PENDING), never PASS
  const ipShipping = [], ipInvalid = [], staleIpRows = [];
  for (const r of rows) {
    const declaresIp = IP_PATTERN.test(rowProvenanceText(r));
    if (r.ip !== true && !declaresIp) continue;
    if (r.ip !== true) { ipInvalid.push({ id: r.id, why: 'declares IP provenance but is not marked ip: true' }); continue; }
    const fs = rowFiles(r);
    if (!fs.length) { staleIpRows.push({ id: r.id, note: 'matches no shipped file: remove the row' }); continue; }
    for (const f of fs) {
      const rs = byFile.get(f).map((id) => rows.find((x) => x.id === id)).filter(Boolean);
      const st = scheduledStatus(f, rs, { wave, specs, root });
      (st.valid ? ipShipping : ipInvalid).push({ id: r.id, file: f, why: st.why });
    }
  }
  // rowless IP files (pending other-lane R30 deletions) ship IP too: PENDING at best, FAIL once expired/orphaned
  for (const p of rowlessPending) ipShipping.push({ id: null, file: p.file, why: p.why });
  for (const p of rowlessInvalid) ipInvalid.push({ id: null, file: p.file, why: p.why });
  const legStatus = legBad.length || ipInvalid.length ? 'FAIL' : ipShipping.length ? 'PENDING' : 'PASS';
  put('legacy-source', legStatus, {
    rows: leg.length, problems: legBad, ipFilesShipping: ipShipping, ipInvalid, staleIpRows, wave,
    ...(ipShipping.length && legStatus === 'PENDING' ? { pending: 'IP still ships under a scheduled exception: this clause cannot PASS until those files and rows are deleted' } : {}),
  });

  // code-rows
  const code = CODE_ROW_IDS.map((id) => rows.find((r) => r.id === id)).map((r, i) => ({ id: CODE_ROW_IDS[i], ok: !!r && r.licence === 'MIT' && !!r.attribution }));
  put('code-rows', code.every((c) => c.ok) ? 'PASS' : 'FAIL', { rows: code });

  // licence-texts
  const texts = rows.filter((r) => r.licence_text).map((r) => ({ id: r.id, file: r.licence_text, ok: existsSync(path.join(root, r.licence_text)) }));
  put('licence-texts', texts.every((t) => t.ok) ? 'PASS' : 'FAIL', { missing: texts.filter((t) => !t.ok) });

  // credits: README text + the RENDERED in-game credits (graded in page context; `rendered` null in the CLI)
  const { requiredAttributions } = await import('./credits.mjs');
  const need = requiredAttributions(manifest);
  const exit = w0ExitReached({ wave, specs, root });
  creditsInput = { need, readmeText: readmeCredits(root), atOrPastW0Exit: exit.reached };
  clauses.credits = { ...gradeCredits({ ...creditsInput, rendered }), w0Exit: exit, exitControl: creditsExitControl(need) };
  if (!clauses.credits.exitControl.ok) clauses.credits.status = 'FAIL';

  // size
  const bytes = duBytes('public', root);
  put('size', bytes <= PUBLIC_CAP_BYTES ? 'PASS' : 'FAIL', { mb: +(bytes / 1048576).toFixed(2), capMb: 60 });

  const statuses = Object.values(clauses).map((c) => c.status);
  const pass = statuses.includes('FAIL') ? false : statuses.includes('PENDING') ? null : true;
  return { pass, clauses, creditsInput, wave };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await check();
  // --json-line: one JSON line (the A-licence-manifest gate reads it); default: the pretty report
  console.log(process.argv.includes('--json-line') ? JSON.stringify(r) : JSON.stringify(r, null, 2));
  if (r.pass === false) process.exitCode = 1;
}
