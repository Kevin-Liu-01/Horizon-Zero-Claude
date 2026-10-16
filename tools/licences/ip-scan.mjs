/**
 * A-ID-ip-assets-gone (pipeline lane; plan §9, R30) — the working-tree scan.
 *
 *   1. every *.glb / *.gltf under public/ that the repo ships (tracked or
 *      untracked-not-ignored; gitignored files are listed, not graded) is
 *      READ WITH gltf-transform (so a
 *      file that does not even parse fails too); its asset.extras, copyright
 *      and generator must not match IP_PATTERN;
 *   2. every one of those GLBs carries asset.extras.provenance.licence in
 *      {CC0-1.0, CC-BY-4.0, CC-BY-3.0, project-original};
 *   3. every MANIFEST* (.md/.json/.txt) and LICENSES.json in the tree declares
 *      no NC / ND licence. A "licence string" is a value a manifest DECLARES:
 *      a JSON `licence`/`license` field, a markdown table cell under a
 *      Licence/License column, or a `Licence:`/`License:` label. Prose that
 *      merely mentions NC ("Zero CC-BY-NC") is listed in the detail as
 *      `proseMentions` but is not a licence.
 *
 * Scope of clause 2: every *.glb under public/ and every model file under
 * public/models/. The animation packs under public/anims (and its lab copies) are .gltf too, but
 * public/anims/** is a FROZEN kept system (plan §1.1) whose bytes no lane may
 * rewrite, so their provenance is their LICENSE file + their LICENSES.json row
 * (listed as `provenanceViaRow`; the IP clause still reads them).
 *
 *   4. every LICENSES.json row: the provenance it declares (title, author,
 *      source_url, attribution, licence_url) must not match IP_PATTERN unless
 *      the row is `ip: true`; and every shipped file under public/ — GLB or
 *      NOT (textures, audio, JSON, fonts) — whose row is `ip: true` or names
 *      IP is an IP hit, unless it is a currently valid scheduled exception.
 *
 * Exceptions: SCHEDULED_IP (lib.mjs) — the files the plan itself keeps past
 * W0a and deletes at a named later wave (plan §6). Each is honoured only while
 * its row is `ip: true` with the same deadline, the repository has not reached
 * that deadline (R5_WAVE, or the lane-report lower bound), and — for the hero
 * body — SPECS.hero still points at it. `rowless` entries (fix round 3: the
 * four R30 machine GLBs, deleted by instruments-core with their classes in
 * W0a, plan §6 row 1) carry no row and hold only while their reader class is
 * in the tree and the wave is before their deadline. An expired or orphaned
 * exception is an IP hit.
 * Every exception is reported by name in every run.
 * This is a working-tree guarantee only (plan §11, decision 2: the files stay
 * in git history until Kevin makes the repo private and rewrites it).
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  ROOT, IP_PATTERN, FORBIDDEN_LICENCE, SCHEDULED_IP, listShipped, listIgnored, loadManifest, matchRows, readGltfJson,
  currentWave, loadSpecs, scheduledStatus, rowProvenanceText,
} from './lib.mjs';

export { SCHEDULED_IP };

export const GLB_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'project-original'];

/** Declared licence strings of a markdown manifest. */
export function markdownLicences(text) {
  const out = [];
  const lines = text.split('\n');
  let col = -1;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|')) {
      const cells = t.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;          // separator row
      const hi = cells.findIndex((c) => /^\**licen[cs]e\**$/i.test(c));
      if (hi >= 0) { col = hi; continue; }                             // header row
      if (col >= 0 && cells[col] !== undefined) out.push(cells[col]);
    } else {
      col = -1;
      const m = /\blicen[cs]e\**\s*:\s*\**\s*([^.;\n]+)/i.exec(t);
      if (m && !/^\s*$/.test(m[1])) out.push(m[1].trim());
    }
  }
  return out;
}

/** Declared licence strings of a JSON manifest (any `licence`/`license` key, any depth). */
export function jsonLicences(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => jsonLicences(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/^licen[cs]e$/i.test(k) && typeof v === 'string') out.push(v);
      else jsonLicences(v, out);
    }
  }
  return out;
}

function manifestFiles(root) {
  let tracked = [];
  try {
    tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n');
  } catch { tracked = listShipped('public', root); }
  return tracked.filter((f) => f && existsSync(path.join(root, f))
    && !f.startsWith('node_modules/')
    && (/(^|\/)MANIFEST[^/]*\.(md|json|txt)$/i.test(f) || /(^|\/)LICENSES\.json$/.test(f)));
}

export async function scan(root = ROOT, { env = process.env } = {}) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  await MeshoptDecoder.ready;
  const manifest = loadManifest(root);
  const rowById = new Map((manifest?.rows || []).map((r) => [r.id, r]));
  const wave = currentWave(root, env);
  const specs = await loadSpecs(root);
  const shipped = listShipped('public', root);
  const glbs = shipped.filter((f) => /\.(glb|gltf)$/i.test(f));
  const ignoredOnDisk = listIgnored('public', root).filter((f) => /\.(glb|gltf)$/i.test(f));
  const { byFile } = matchRows(manifest, shipped);
  const ipHits = [], noProvenance = [], unreadable = [], viaRow = [];
  const exceptions = new Map();          // file -> { file, ..., status }
  const perFile = {};
  const rowsOf = (f) => (byFile.get(f) || []).map((id) => rowById.get(id)).filter(Boolean);
  /** an IP-bearing file: a valid scheduled exception, or a hit (with the reason the exception does not hold) */
  const ipFile = (f, evidence) => {
    const st = scheduledStatus(f, rowsOf(f), { wave, specs, root });
    if (st.valid) {
      const prev = exceptions.get(f);
      exceptions.set(f, { file: f, ...(prev || {}), ...evidence, deadline: st.deadline, owner: st.owner, ...(st.rowless ? { rowless: true, reader: st.reader } : {}), status: st.why });
      return true;
    }
    ipHits.push({ file: f, ...evidence, ...(SCHEDULED_IP[f] ? { exception: st.why } : {}) });
    return false;
  };

  // 1 + 2: every shipped GLB / glTF, read with gltf-transform
  for (const f of glbs) {
    let asset;
    try {
      const doc = await io.read(path.join(root, f));
      asset = doc.getRoot().getAsset();
    } catch (err) {
      unreadable.push({ file: f, error: String(err?.message || err).slice(0, 160) });
      continue;
    }
    const extras = asset.extras || {};
    // the raw document too: a reader may normalise `generator` on load
    let raw = {};
    try { raw = readGltfJson(path.join(root, f)).asset || {}; } catch { /* io.read already parsed it */ }
    const text = [JSON.stringify(extras), asset.copyright || '', asset.generator || '',
      JSON.stringify(raw.extras || {}), raw.copyright || '', raw.generator || ''].join(' ');
    const m = IP_PATTERN.exec(text);
    const lic = extras?.provenance?.licence ?? null;
    perFile[f] = { licence: lic, generator: asset.generator || null };
    const rows = rowsOf(f);
    // a valid scheduled exception is listed and skips the provenance clause;
    // any other IP hit is ALSO graded on provenance (both are reported)
    if ((m || (!GLB_LICENCES.includes(lic) && SCHEDULED_IP[f])) && ipFile(f, { match: m ? m[0] : null, licence: lic })) continue;
    if (GLB_LICENCES.includes(lic)) continue;
    const frozenAnim = /^public\/anims[^/]*\//.test(f) && f.endsWith('.gltf');
    const rowLic = rows.length === 1 ? rows[0].licence : null;
    if (frozenAnim && GLB_LICENCES.includes(rowLic)) {
      viaRow.push({ file: f, row: rows[0].id, licence: rowLic, ...(rows[0].delete_at ? { delete_at: rows[0].delete_at, delete_owner: rows[0].delete_owner } : {}) });
      continue;
    }
    noProvenance.push({ file: f, licence: lic });
  }

  // 4: the manifest rows, and every shipped file (any type) through its row
  const rowIp = [], staleIpRows = [];
  for (const r of manifest?.rows || []) {
    const m = IP_PATTERN.exec(rowProvenanceText(r));
    const files = shipped.filter((f) => (byFile.get(f) || []).includes(r.id));
    if (m && r.ip !== true) rowIp.push({ row: r.id, match: m[0], why: 'row declares IP provenance but is not marked ip: true' });
    if (r.ip === true && !files.length) staleIpRows.push({ row: r.id, note: 'ip: true row matches no shipped file: remove the row (its file is gone)' });
  }
  for (const f of shipped) {
    if (exceptions.has(f) || ipHits.some((h) => h.file === f)) continue;
    const rows = rowsOf(f);
    const flagged = rows.filter((r) => r.ip === true || IP_PATTERN.test(rowProvenanceText(r)));
    if (flagged.length) ipFile(f, { row: flagged.map((r) => r.id).join(','), match: flagged.map((r) => (IP_PATTERN.exec(rowProvenanceText(r)) || ['ip: true'])[0]).join(',') });
  }

  // 3: manifests
  const forbidden = [], proseMentions = [];
  const scanned = [];
  for (const f of manifestFiles(root)) {
    const text = readFileSync(path.join(root, f), 'utf8');
    let declared;
    if (f.endsWith('.json')) {
      try { declared = jsonLicences(JSON.parse(text)); } catch { declared = []; forbidden.push({ file: f, licence: 'unparseable JSON' }); }
    } else declared = markdownLicences(text);
    scanned.push({ file: f, declared: declared.length });
    for (const d of declared) if (FORBIDDEN_LICENCE.test(d)) forbidden.push({ file: f, licence: d.slice(0, 80) });
    text.split('\n').forEach((line, i) => {
      if (FORBIDDEN_LICENCE.test(line)) proseMentions.push(`${f}:${i + 1}`);
    });
  }
  const pass = !ipHits.length && !rowIp.length && !noProvenance.length && !unreadable.length && !forbidden.length;
  return {
    pass,
    glbs: glbs.length, filesThroughRows: shipped.length, ipHits, rowIpUnflagged: rowIp, noProvenance, unreadable,
    scheduledExceptions: [...exceptions.values()], staleIpRows, wave, provenanceViaRow: viaRow,
    ignoredOnDisk: ignoredOnDisk.length ? { files: ignoredOnDisk, note: 'gitignored, not shipped by the repo (e.g. tools/r5-poc proof outputs, deleted at the W0 exit)' } : [],
    manifests: scanned.length, forbiddenLicences: forbidden,
    proseMentions: proseMentions.length ? { count: proseMentions.length, where: proseMentions.slice(0, 8), note: 'prose, not declared licences' } : null,
    licences: perFile,
    scope: 'working tree only (plan §11 decision 2: git history still holds the deleted files)',
  };
}

/**
 * NEGATIVE CONTROLS, in a throwaway root outside the repo (no git there, so
 * every file on disk counts as shipped). Each case must be caught:
 *   base       a GLB whose extras name a forbidden source and carry no
 *              provenance + a MANIFEST.md declaring an NC licence
 *   fanRip     a second IP GLB under a legacy `ip: true` row that is NOT a
 *              scheduled exception (the judge's planted control)
 *   nonGlb     a PNG under an `ip: true` row (IP in a non-GLB file)
 *   unflagged  a row whose title names IP but is not marked `ip: true`
 *   expiry     a scheduled hero body that is valid at W0a, and EXPIRED when
 *              (a) R5_WAVE='W1', (b) a W1 lane report exists, (c) SPECS.hero
 *              no longer points at it
 *   pendingOtherLane  (fix round 3) a rowless R30 machine GLB whose deletion
 *              another lane owns this wave, with its reader class present:
 *              honoured in-wave (scan PASS, files-matched/legacy-source
 *              PENDING for it), and an IP hit + unmatched FAIL when
 *              (a) R5_WAVE='W0a exit', (b) its reader class is deleted
 *              (orphaned), (c) a LICENSES.json row appears for it
 * check.mjs's legacy-source clause is graded on the same root: FAIL with the
 * fan rip present, PENDING (never PASS) with only the valid scheduled file.
 */
export async function selfTest(dir, { planFile = path.join(ROOT, 'docs/ROUND5-PLAN.md') } = {}) {
  const { Document } = await import('@gltf-transform/core');
  const { mkdirSync, rmSync: rm, copyFileSync } = await import('node:fs');
  const { check } = await import('./check.mjs');
  rm(dir, { recursive: true, force: true });
  for (const d of ['public/models', 'public/textures', 'docs', 'src/core']) mkdirSync(path.join(dir, d), { recursive: true });
  const ipGlb = async (rel, extras) => {
    const doc = new Document();
    doc.createScene('s').addChild(doc.createNode('n'));
    doc.getRoot().getAsset().extras = extras;
    await new NodeIO().write(path.join(dir, rel), doc);
  };
  const writeRows = (rows) => writeFileSync(path.join(dir, 'public/LICENSES.json'), JSON.stringify({ schema: 1, rows }, null, 2));
  const heroRow = { id: 'hero-ip', paths: ['public/models/aloy.glb'], title: 'IP hero', author: 'x', source_url: 'https://sketchfab.com/x',
    licence: 'CC-BY-4.0', attribution: 'x', legacy: 'r4', ip: true, delete_at: 'W0 exit (R30)', delete_owner: 'hero-body' };
  const writeSpecs = (url) => writeFileSync(path.join(dir, 'src/core/assets.specs.js'), `export const SPECS = { hero: { url: '${url}', targetHeight: 1.7 } };\n`);
  const out = {};
  try {
    copyFileSync(planFile, path.join(dir, 'docs/ROUND5-PLAN.md'));
    writeFileSync(path.join(dir, 'docs/ROUND5-PIPELINE.md'), 'report\n');            // repository at W0a
    writeSpecs('/models/aloy.glb');
    // base
    await ipGlb('public/models/control.glb', { title: 'Some Horizon fan model', source: 'https://sketchfab.com/x' });
    writeFileSync(path.join(dir, 'public/MANIFEST.md'), '| file | licence |\n|---|---|\n| control.glb | CC-BY-NC-4.0 |\n');
    writeRows([]);
    let r = await scan(dir, { env: {} });
    out.base = { ok: r.ipHits.length === 1 && r.noProvenance.length === 1 && r.forbiddenLicences.length === 1 && r.pass === false,
      ipHits: r.ipHits.length, noProvenance: r.noProvenance.length, forbidden: r.forbiddenLicences.length };
    rm(path.join(dir, 'public/models/control.glb')); rm(path.join(dir, 'public/MANIFEST.md'));

    // the scheduled hero body alone: a valid exception, legacy-source PENDING
    await ipGlb('public/models/aloy.glb', { title: 'Aloy - Fortnite', source: 'https://sketchfab.com/x', license: 'CC-BY-4.0' });
    writeRows([heroRow]);
    r = await scan(dir, { env: {} });
    let c = await check(dir, { env: {} });
    out.scheduledAlone = { ok: r.pass === true && r.scheduledExceptions.length === 1 && c.clauses['legacy-source'].status === 'PENDING',
      scanPass: r.pass, exceptions: r.scheduledExceptions.length, legacySource: c.clauses['legacy-source'].status };

    // fanRip: the judge's planted control (a second IP GLB under a legacy ip:true row)
    copyFileSync(path.join(dir, 'public/models/aloy.glb'), path.join(dir, 'public/models/another-fan-rip.glb'));
    writeRows([heroRow, { id: 'legacy-x', paths: ['public/models/another-fan-rip.glb'], title: 'x', author: 'x', source_url: 'x',
      licence: 'CC-BY-4.0', attribution: 'x', legacy: 'r4', ip: true, delete_at: 'W0 exit', delete_owner: 'x' }]);
    r = await scan(dir, { env: {} });
    c = await check(dir, { env: {} });
    out.fanRip = { ok: r.pass === false && r.ipHits.some((h) => h.file.endsWith('another-fan-rip.glb')) && c.clauses['legacy-source'].status === 'FAIL' && c.pass === false,
      scanPass: r.pass, legacySource: c.clauses['legacy-source'].status, checkPass: c.pass };
    rm(path.join(dir, 'public/models/another-fan-rip.glb'));

    // nonGlb: a texture under an ip:true row
    writeFileSync(path.join(dir, 'public/textures/fan-rip.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    writeRows([heroRow, { id: 'legacy-tex', paths: ['public/textures/fan-rip.png'], title: 'x', author: 'x', source_url: 'x',
      licence: 'CC0-1.0', legacy: 'r4', ip: true, delete_at: 'W2 exit', delete_owner: 'x' }]);
    r = await scan(dir, { env: {} });
    c = await check(dir, { env: {} });
    out.nonGlb = { ok: r.pass === false && r.ipHits.some((h) => h.file.endsWith('fan-rip.png')) && c.clauses['legacy-source'].status === 'FAIL',
      scanPass: r.pass, legacySource: c.clauses['legacy-source'].status };

    // unflagged: the same texture, its row names IP in the title, no ip flag
    writeRows([heroRow, { id: 'legacy-tex', paths: ['public/textures/fan-rip.png'], title: 'Thunderjaw plate (Horizon fan art)', author: 'x',
      source_url: 'x', licence: 'CC0-1.0', legacy: 'r4', delete_at: 'W2 exit', delete_owner: 'x' }]);
    r = await scan(dir, { env: {} });
    c = await check(dir, { env: {} });
    out.unflagged = { ok: r.pass === false && r.rowIpUnflagged.length === 1 && c.clauses['legacy-source'].status === 'FAIL',
      scanPass: r.pass, rowIpUnflagged: r.rowIpUnflagged.length, legacySource: c.clauses['legacy-source'].status };
    rm(path.join(dir, 'public/textures/fan-rip.png'));
    writeRows([heroRow]);

    // expiry, three independent triggers
    r = await scan(dir, { env: { R5_WAVE: 'W1' } });
    const byEnv = r.pass === false && /EXPIRED/.test(r.ipHits[0]?.exception || '');
    writeFileSync(path.join(dir, 'docs/ROUND5-MELEE.md'), 'report\n');                // a W1 lane has merged
    r = await scan(dir, { env: {} });
    const byReports = r.pass === false && /EXPIRED/.test(r.ipHits[0]?.exception || '') && r.wave.wave === 'W1';
    c = await check(dir, { env: {} });
    const checkByReports = c.clauses['legacy-source'].status === 'FAIL';
    rm(path.join(dir, 'docs/ROUND5-MELEE.md'));
    writeSpecs('/models/hero/brea-body.glb');                                          // the replacement has landed
    r = await scan(dir, { env: {} });
    const bySpecs = r.pass === false && /SPECS\.hero no longer points/.test(r.ipHits[0]?.exception || '');
    out.expiry = { ok: byEnv && byReports && checkByReports && bySpecs, byEnv, byReports, checkByReports, bySpecs };
    writeSpecs('/models/aloy.glb');

    // pendingOtherLane (fix round 3): an R30 machine GLB another lane deletes this wave with its
    // reader class, shipped WITHOUT a row. Honoured in-wave only; an IP hit when (a) the wave
    // reaches its deadline, (b) its reader class is gone (orphaned), (c) a row appears for it
    const RL = 'public/models/watcher.glb';
    const reader = SCHEDULED_IP[RL]?.reader;
    await ipGlb(RL, { title: 'Redeye Watcher Rig, Horizon Zero Dawn', source: 'https://sketchfab.com/x' });
    mkdirSync(path.dirname(path.join(dir, reader)), { recursive: true });
    writeFileSync(path.join(dir, reader), 'export class W {}\n');
    r = await scan(dir, { env: {} });
    c = await check(dir, { env: {} });
    // (the throwaway root has no row for LICENSES.json itself, so files-matched is read for THIS file only)
    const fm = (cc) => cc.clauses['files-matched'];
    const inWave = r.pass === true && r.scheduledExceptions.some((e) => e.file === RL && e.rowless)
      && fm(c).pendingOtherLaneDeletions.some((p) => p.file === RL) && !fm(c).unmatched.includes(RL)
      && c.clauses['legacy-source'].status === 'PENDING';
    r = await scan(dir, { env: { R5_WAVE: 'W0a exit' } });
    c = await check(dir, { env: { R5_WAVE: 'W0a exit' } });
    const atExit = r.pass === false && /EXPIRED/.test(r.ipHits.find((h) => h.file === RL)?.exception || '')
      && fm(c).status === 'FAIL' && fm(c).unmatched.includes(RL) && c.clauses['legacy-source'].status === 'FAIL';
    rm(path.join(dir, reader));
    r = await scan(dir, { env: {} });
    c = await check(dir, { env: {} });
    const orphaned = r.pass === false && /ORPHANED/.test(r.ipHits.find((h) => h.file === RL)?.exception || '')
      && fm(c).status === 'FAIL' && fm(c).unmatched.includes(RL) && c.clauses['legacy-source'].status === 'FAIL';
    writeFileSync(path.join(dir, reader), 'export class W {}\n');
    writeRows([heroRow, { id: 'legacy-w', paths: [RL], title: 'x', author: 'x', source_url: 'x', licence: 'CC-BY-4.0', attribution: 'x',
      legacy: 'r4', ip: true, delete_at: 'W0a', delete_owner: 'instruments-core' }]);
    r = await scan(dir, { env: {} });
    const withRow = r.pass === false && /no LICENSES\.json row/.test(r.ipHits.find((h) => h.file === RL)?.exception || '');
    writeRows([heroRow]);
    rm(path.join(dir, RL)); rm(path.join(dir, reader));
    out.pendingOtherLane = { ok: inWave && atExit && orphaned && withRow, inWave, atExit, orphaned, withRow };
  } finally { rm(dir, { recursive: true, force: true }); }
  const ok = Object.values(out).every((x) => x.ok);
  return { ok, ...out, ipHits: out.base?.ipHits, noProvenance: out.base?.noProvenance, forbidden: out.base?.forbidden };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await scan();
  console.log(JSON.stringify(r, null, 2));
  if (!r.pass) process.exitCode = 1;
}
