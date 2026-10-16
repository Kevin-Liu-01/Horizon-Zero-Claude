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
 *                     names the W0b re-fetch in `pending`)
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
 *                     README "Credits" section and in the in-game credits
 *                     (src/ui/menu.js). Both surfaces are brand's (W0b), so
 *                     this clause is PENDING until brand wires credits.mjs
 *   size              du public/ <= 60 MB
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT, ASSET_LICENCES, CODE_LICENCES, NEEDS_ATTRIBUTION, FORBIDDEN_LICENCE, IP_PATTERN,
  loadManifest, listShipped, listIgnored, matchRows, duBytes,
  currentWave, loadSpecs, scheduledStatus, rowProvenanceText, SCHEDULED_IP,
} from './lib.mjs';
import { validateRow } from './add.mjs';

export const PUBLIC_CAP_BYTES = 60 * 1024 * 1024;
const CODE_ROW_IDS = ['code-three', 'code-three-mesh-bvh', 'code-meshopt-decoder'];

/** The README "Credits" section text (from its heading to the next h2), or ''. */
export function readmeCredits(root = ROOT) {
  const f = path.join(root, 'README.md');
  if (!existsSync(f)) return '';
  const text = readFileSync(f, 'utf8');
  const m = /^##\s+Credits\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m.exec(text);
  return m ? m[1] : '';
}

export async function check(root = ROOT, { env = process.env } = {}) {
  const clauses = {};
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

  // third-party (non-legacy, not project-original, not code)
  const tp = rows.filter((r) => !r.legacy && r.licence !== 'project-original' && !CODE_LICENCES.includes(r.licence)
    || (r.legacy && r.pending));
  const missing = [], pending = [];
  for (const r of tp) {
    const need = ['source_url', 'archive_sha256', 'retrieved'].filter((k) => !r[k]);
    if (!need.length) continue;
    if (r.pending) pending.push({ id: r.id, missing: need, pending: r.pending });
    else missing.push({ id: r.id, missing: need });
  }
  put('third-party', missing.length ? 'FAIL' : pending.length ? 'PENDING' : 'PASS', { rows: tp.length, missing, pending });

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

  // credits (brand surfaces)
  const credits = readmeCredits(root);
  let menu = '';
  try { menu = readFileSync(path.join(root, 'src/ui/menu.js'), 'utf8'); } catch { /* absent */ }
  // ip rows are never credited (plan §10.2: no fan-art rows in the credits;
  // credits.mjs skips them). That is not a bypass: legacy-source above keeps
  // this gate from passing while any ip file ships.
  const needCredit = rows.filter((r) => r.attribution && r.ip !== true);
  const notInReadme = needCredit.filter((r) => !credits.includes(r.attribution)).map((r) => r.id);
  const notInGame = needCredit.filter((r) => !menu.includes(r.attribution)).map((r) => r.id);
  put('credits', notInReadme.length || notInGame.length ? 'PENDING' : 'PASS', {
    attributions: needCredit.length, notInReadme, notInGame,
    owner: 'brand W0b: paste `node tools/licences/credits.mjs --md` into README "Credits" and feed `--json` to src/ui/menu.js CREDITS',
  });

  // size
  const bytes = duBytes('public', root);
  put('size', bytes <= PUBLIC_CAP_BYTES ? 'PASS' : 'FAIL', { mb: +(bytes / 1048576).toFixed(2), capMb: 60 });

  const statuses = Object.values(clauses).map((c) => c.status);
  const pass = statuses.includes('FAIL') ? false : statuses.includes('PENDING') ? null : true;
  return { pass, clauses };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await check();
  console.log(JSON.stringify(r, null, 2));
  if (r.pass === false) process.exitCode = 1;
}
