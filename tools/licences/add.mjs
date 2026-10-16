/**
 * Add or replace one row of public/LICENSES.json (pipeline lane; plan §10.1:
 * "every lane adds rows through tools/licences/add.mjs").
 *
 *   node tools/licences/add.mjs --file row.json        (a row object, or an array)
 *   node tools/licences/add.mjs --json '{"id": ...}'
 *   node tools/licences/add.mjs --remove <id>
 *   node tools/licences/add.mjs --format               (rewrite in canonical form)
 *
 * A row is validated before anything is written: id, non-empty `paths`, an
 * allowed SPDX licence (MIT only for code rows), `attribution` on CC-BY and
 * MIT rows, never NC/ND, and `source_url` on every non-project-original row —
 * with NO exemption for `ip: true` rows (an IP row is a provenance record of a
 * file that must go, and it needs the same record as any other). An `ip: true`
 * row also needs `delete_at` (its deadline) and `delete_owner`.
 * Rows are kept sorted by id; the file is rewritten in one canonical format so
 * concurrent lanes' additions merge as independent hunks.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, MANIFEST, ASSET_LICENCES, CODE_LICENCES, NEEDS_ATTRIBUTION, FORBIDDEN_LICENCE, loadManifest } from './lib.mjs';

export const FIELD_ORDER = ['id', 'paths', 'title', 'author', 'source_url', 'licence', 'licence_text', 'licence_url',
  'archive_sha256', 'archive_bytes', 'retrieved', 'modified', 'attribution', 'legacy', 'ip', 'delete_at', 'delete_owner', 'pending'];

export function validateRow(r) {
  const errs = [];
  if (!r || typeof r !== 'object') return ['row is not an object'];
  if (!r.id || !/^[a-z0-9][a-z0-9-]*$/.test(r.id)) errs.push('id: lower-case kebab id required');
  if (!Array.isArray(r.paths) || !r.paths.length) errs.push('paths: non-empty array required');
  const isCode = Array.isArray(r.paths) && !r.paths.some((p) => p.startsWith('public/'));
  const allowed = isCode ? [...ASSET_LICENCES, ...CODE_LICENCES] : ASSET_LICENCES;
  if (!allowed.includes(r.licence)) errs.push(`licence: one of ${allowed.join(', ')}`);
  if (FORBIDDEN_LICENCE.test(String(r.licence))) errs.push('licence: NC/ND is never allowed');
  if (NEEDS_ATTRIBUTION.includes(r.licence) && !r.attribution) errs.push('attribution: required for CC-BY and MIT');
  if (r.licence !== 'project-original' && !r.source_url) errs.push('source_url: required for third-party rows');
  if (r.ip === true && (!r.delete_at || !r.delete_owner)) errs.push('ip: an IP row needs delete_at (its deadline) and delete_owner');
  for (const k of ['title', 'author']) if (!r[k]) errs.push(`${k}: required`);
  return errs;
}

function canonical(row) {
  const out = {};
  for (const k of FIELD_ORDER) if (k in row) out[k] = row[k];
  for (const k of Object.keys(row)) if (!(k in out)) out[k] = row[k];
  return out;
}

export function serialise(manifest) {
  const rows = [...manifest.rows].map(canonical);
  const fixed = rows.filter((r) => r.id === 'calima-licence-manifest');
  const rest = rows.filter((r) => r.id !== 'calima-licence-manifest').sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return `${JSON.stringify({ ...manifest, rows: [...fixed, ...rest] }, null, 2)}\n`;
}

export function upsert(rows, { root = ROOT } = {}) {
  const manifest = loadManifest(root) || { schema: 1, project: 'CALIMA', rows: [] };
  for (const row of rows) {
    const errs = validateRow(row);
    if (errs.length) throw new Error(`row ${row?.id ?? '?'}: ${errs.join('; ')}`);
    const i = manifest.rows.findIndex((r) => r.id === row.id);
    if (i >= 0) manifest.rows[i] = row; else manifest.rows.push(row);
  }
  writeFileSync(path.join(root, MANIFEST), serialise(manifest));
  return manifest.rows.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : null; };
  if (a.includes('--format')) {
    const m = loadManifest();
    for (const r of m.rows) { const e = validateRow(r); if (e.length) console.error(`[licences] ${r.id}: ${e.join('; ')}`); }
    writeFileSync(path.join(ROOT, MANIFEST), serialise(m));
    console.log(`[licences] formatted ${m.rows.length} rows`);
  } else if (val('--remove')) {
    const m = loadManifest();
    const before = m.rows.length;
    m.rows = m.rows.filter((r) => r.id !== val('--remove'));
    writeFileSync(path.join(ROOT, MANIFEST), serialise(m));
    console.log(`[licences] removed ${before - m.rows.length} row(s)`);
  } else {
    const src = val('--file') ? readFileSync(val('--file'), 'utf8') : val('--json');
    if (!src) { console.error('usage: add.mjs --file row.json | --json <row> | --remove <id> | --format'); process.exit(2); }
    const parsed = JSON.parse(src);
    const n = upsert(Array.isArray(parsed) ? parsed : [parsed]);
    console.log(`[licences] ${n} rows`);
  }
}
