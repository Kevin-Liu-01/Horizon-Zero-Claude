/**
 * Fold another lane's `public/LICENSES.json` into this tree's (pipeline lane,
 * W0b fix round 1; for the orchestrator at a lane merge). A three-way merge of
 * ROWS, not of text, with one rule of its own:
 *
 *   SOURCE ROWS ARE PIPELINE'S. A row whose paths are all under
 *   `models-staging/r5-src/` (ubc-standard, mco-fantasy-standard,
 *   ual2-standard, …) records a third-party archive. When the other lane used
 *   the same id (or a row with the same `source_url`) to cover the files it
 *   SHIPS (Brea, her clips, an outfit), those shipped paths become a
 *   `derived_from` row of the source row instead (plan §10.1 + the pipeline
 *   doc §2.2 contract): the archive record stays in one place and A-sources-
 *   staged does not demand a second staged copy of the same archive.
 *
 *   node tools/licences/fold.mjs --theirs <their LICENSES.json> [--base <merge-base LICENSES.json>] [--root <tree>] [--write]
 *
 * Usage at a merge (the orchestrator; read-only git):
 *   git show <merge-base>:public/LICENSES.json      > base.json
 *   git show r5/w0b-hero-body:public/LICENSES.json   > theirs.json
 *   (resolve public/LICENSES.json to pipeline's side, then)
 *   node tools/licences/fold.mjs --theirs theirs.json --base base.json --write
 *
 * Per row id:
 *   same in theirs and base               their side did not touch it: ours stays
 *   only in theirs                        added (validated with add.mjs validateRow)
 *   same id / same source_url as one of
 *     OUR source rows, theirs ships public files -> DERIVED row: id from the first
 *                                         shipped file's name, `derived_from` = the
 *                                         source row + every source row the shipped
 *                                         GLB's `asset.extras.provenance.sources` names,
 *                                         `source_url` = the provenance recipe
 *   in base and ours, gone from theirs    deleted (their deletion, e.g. aloy.glb's row)
 *                                         when ours still equals base, else CONFLICT
 *   changed on both sides differently     CONFLICT (nothing written)
 * Prints one JSON summary; exit 1 on a conflict or an invalid row.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, MANIFEST, loadManifest, readGltfJson, CODE_LICENCES } from './lib.mjs';
import { validateRow, serialise } from './add.mjs';

const SRC_PREFIX = 'models-staging/r5-src/';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isSourceRow = (r) => Array.isArray(r?.paths) && r.paths.length > 0 && r.paths.every((p) => p.startsWith(SRC_PREFIX));
const shipped = (r) => (r.paths || []).filter((p) => p.startsWith('public/'));

/** The provenance of the first shipped GLB of a row (null when not on disk or not a GLB). */
function provenanceOf(row, root) {
  for (const p of shipped(row)) {
    if (!/\.glb$/i.test(p) || /[*?{]/.test(p)) continue;
    const f = path.join(root, p);
    if (!existsSync(f)) continue;
    try { return readGltfJson(f).asset?.extras?.provenance || null; } catch { return null; }
  }
  return null;
}

export function fold({ ours, theirs, base = null, root = ROOT }) {
  const out = { added: [], derived: [], deletedByTheirs: [], takenFromTheirs: [], conflicts: [], invalid: [], unchanged: 0 };
  const rows = new Map(ours.rows.map((r) => [r.id, r]));
  const baseById = new Map((base?.rows || []).map((r) => [r.id, r]));
  const theirsById = new Map(theirs.rows.map((r) => [r.id, r]));
  const sourceRows = () => [...rows.values()].filter(isSourceRow);
  const derive = (t, src) => {
    const files = shipped(t);
    const prov = provenanceOf(t, root);
    const sourceIds = new Set(sourceRows().map((r) => r.id));
    const from = [...new Set([src.id, ...(prov?.sources || []).filter((id) => sourceIds.has(id))])].sort();
    const stem = path.basename(files.find((p) => /\.glb$/i.test(p)) || files[0]).replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    let id = stem;
    for (let n = 2; rows.has(id) || (theirsById.has(id) && id !== t.id); n++) id = `${stem}-${n}`;
    const row = {
      id, paths: files, title: t.title, author: t.author,
      source_url: prov?.recipe || t.source_url, licence: t.licence, licence_text: t.licence_text ?? null,
      archive_sha256: null, derived_from: from, retrieved: null, modified: t.modified ?? null, attribution: t.attribution ?? null,
    };
    const errs = validateRow(row);
    if (errs.length) { out.invalid.push({ id, errs }); return; }
    rows.set(id, row);
    out.derived.push({ id, from, paths: files, fromTheirRow: t.id, unknownProvenanceSources: (prov?.sources || []).filter((s) => !sourceIds.has(s) && !rows.has(s)) });
  };
  for (const t of theirs.rows) {
    const b = baseById.get(t.id);
    const o = rows.get(t.id);
    if (b && same(b, t)) { out.unchanged++; continue; }                         // their side did not touch it
    if (o && same(o, t)) { out.unchanged++; continue; }
    // their shipped files under one of OUR source rows (same id, or an alias with the same source_url)
    const src = (o && isSourceRow(o)) ? o
      : (!o && t.licence !== 'project-original' && !CODE_LICENCES.includes(t.licence) && !isSourceRow(t)
        ? sourceRows().find((s) => s.source_url && s.source_url === t.source_url) : null);
    if (src && shipped(t).length) { derive(t, src); continue; }
    if (!o) {
      if (b) { out.conflicts.push({ id: t.id, why: 'we deleted this row and they changed it' }); continue; }
      const errs = validateRow(t);
      if (errs.length) { out.invalid.push({ id: t.id, errs }); continue; }
      rows.set(t.id, t); out.added.push(t.id); continue;
    }
    if (b && same(b, o)) { rows.set(t.id, t); out.takenFromTheirs.push(t.id); continue; }   // only they changed it
    out.conflicts.push({ id: t.id, why: 'changed on both sides' });
  }
  // their deletions
  for (const [id, b] of baseById) {
    if (theirsById.has(id) || !rows.has(id)) continue;
    if (same(rows.get(id), b)) { rows.delete(id); out.deletedByTheirs.push(id); } else out.conflicts.push({ id, why: 'they deleted this row and we changed it' });
  }
  return { manifest: { ...ours, rows: [...rows.values()] }, summary: out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
  const root = val('--root') ? path.resolve(val('--root')) : ROOT;
  if (!val('--theirs')) { console.error('usage: fold.mjs --theirs <LICENSES.json> [--base <LICENSES.json>] [--root <tree>] [--write]'); process.exit(2); }
  const ours = loadManifest(root);
  const theirs = JSON.parse(readFileSync(val('--theirs'), 'utf8'));
  const base = val('--base') ? JSON.parse(readFileSync(val('--base'), 'utf8')) : null;
  const { manifest, summary } = fold({ ours, theirs, base, root });
  const bad = summary.conflicts.length || summary.invalid.length;
  if (a.includes('--write') && !bad) writeFileSync(path.join(root, MANIFEST), serialise(manifest));
  console.log(JSON.stringify({ ok: !bad, written: a.includes('--write') && !bad, rows: manifest.rows.length, ...summary }));
  if (bad) process.exitCode = 1;
}
