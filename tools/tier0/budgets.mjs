// @ts-check
/**
 * Tier 0 asset budgets, read from files (no browser):
 *   asset-budgets     per-asset caps: Brea as worn, near-tier people, Instruments by class, texture edge
 *   texture-ledger    summed resident texture memory against the cap
 *   shipped-ledger    summed shipped bytes: the first load (the boot set: every public/ file the game does not defer,
 *                     plus the built code) against the first-load cap, and every file against the milestone total cap.
 *                     The deferred set is read from the modules the game itself loads late by (budgets.json
 *                     shipped.deferred: today the audio manifest's DEFERRED_FILES), never from a list kept here.
 *                     Its megabytes are DECIMAL (10^6 bytes), the unit tools/perf/boot-transfer.mjs measures the built
 *                     game's first load in: one cap, one unit (the mebibyte figure is printed beside it). The texture
 *                     ledger stays in mebibytes (resident memory).
 *
 *   node tools/tier0/budgets.mjs [--tree <dir>]
 *
 * Numbers live in tools/tier0/budgets.json. GLBs are parsed by lib/glb.mjs.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { listFiles, sizeOf, mb, MB } from './lib/files.mjs';
import { inspectGlb, imageSize, residentBytes, isBlockCompressed } from './lib/glb.mjs';

const IMAGE = /\.(png|jpe?g|webp|ktx2)$/i;

/** @param {string} root */
export function loadBudgets(root) {
  const own = path.join(root, 'tools/tier0/budgets.json');
  const here = new URL('./budgets.json', import.meta.url);
  return JSON.parse(readFileSync(existsSync(own) ? own : here, 'utf8'));   // a tree without Tier 0 uses this copy's
}

/**
 * Assign a file to the first ledger line whose prefixes match (an empty prefix matches anything).
 * @param {string} rel
 * @param {{ id: string, prefixes: string[], excludePrefixes?: string[] }[]} lines
 */
export function lineOf(rel, lines) {
  for (const l of lines) {
    if ((l.excludePrefixes || []).some((p) => rel.startsWith(p))) continue;
    if (l.prefixes.some((p) => rel.startsWith(p))) return l.id;
  }
  return lines[lines.length - 1].id;
}

/**
 * Read every shipped GLB and image once.
 * @param {string} root
 */
export function readAssets(root) {
  const files = listFiles(root, ['public']);
  /** @type {Map<string, import('./lib/glb.mjs').GlbInfo>} */
  const glbs = new Map();
  /** @type {{ file: string, sha1: string, width: number, height: number, layers?: number, compressed: boolean, mime: string }[]} */
  const textures = [];
  const errors = [];
  for (const f of files) {
    if (/\.glb$/i.test(f)) {
      try {
        const g = inspectGlb(readFileSync(path.join(root, f)));
        glbs.set(f, g);
        for (const im of g.images) textures.push({ file: f, sha1: im.sha1, width: im.width, height: im.height, compressed: im.compressed, mime: im.mime });
      } catch (e) { errors.push(`${f}: ${String(e).slice(0, 200)}`); }
    } else if (IMAGE.test(f)) {
      const b = readFileSync(path.join(root, f));
      const sz = imageSize(new Uint8Array(b.buffer, b.byteOffset, b.byteLength));
      if (!sz) { errors.push(`${f}: unreadable image header`); continue; }
      textures.push({ file: f, sha1: `file:${f}`, width: sz.width, height: sz.height, layers: sz.layers || 1, compressed: isBlockCompressed(sz), mime: sz.mime });
    }
  }
  return { files, glbs, textures, errors };
}

/**
 * @param {{ root: string, assets?: ReturnType<typeof readAssets> }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function runAssetBudgets({ root, assets }) {
  const t0 = Date.now();
  const B = loadBudgets(root).perAsset;
  const A = assets || readAssets(root);
  const failures = [...A.errors];
  const rows = [];
  // Brea as worn
  const body = A.glbs.get(B.hero.body);
  if (!body) failures.push(`hero: ${B.hero.body} missing`);
  else {
    const outfits = [...A.glbs.keys()].filter((f) => B.hero.outfitPrefixes.some((/** @type {string} */ p) => f.startsWith(p)));
    for (const o of outfits.length ? outfits : [null]) {
      const g = o ? A.glbs.get(o) : null;
      const tris = body.triangles + (g?.triangles || 0);
      const draws = body.draws + (g?.draws || 0);
      const label = `Brea + ${o ? path.basename(o) : '(no outfit)'}`;
      rows.push(`${label}: ${tris} tris / ${B.hero.maxTriangles}, ${draws} draws / ${B.hero.maxDraws}`);
      if (tris > B.hero.maxTriangles) failures.push(`${label}: ${tris} triangles > ${B.hero.maxTriangles}`);
      if (draws > B.hero.maxDraws) failures.push(`${label}: ${draws} draws > ${B.hero.maxDraws}`);
    }
  }
  // people
  for (const [f, g] of A.glbs) {
    if (!f.startsWith(B.npc.prefix) || B.npc.notBodies.some((/** @type {string} */ p) => f.startsWith(p))) continue;
    rows.push(`${path.basename(f)}: ${g.triangles} tris / ${B.npc.maxTriangles}, ${g.draws} draws / ${B.npc.maxDraws} (LODs ${Object.keys(g.byLod).sort().join(',')})`);
    if (g.triangles > B.npc.maxTriangles) failures.push(`${f}: near tier ${g.triangles} triangles > ${B.npc.maxTriangles}`);
    if (g.draws > B.npc.maxDraws) failures.push(`${f}: near tier ${g.draws} draws > ${B.npc.maxDraws}`);
  }
  // Instruments
  for (const [f, g] of A.glbs) {
    if (!f.startsWith(B.instruments.prefix)) continue;
    const kind = path.basename(f, '.glb');
    const cls = B.instruments.classOf[kind];
    if (!cls) { failures.push(`${f}: no size class for Instrument '${kind}' in tools/tier0/budgets.json`); continue; }
    const cap = B.instruments.maxTriangles[cls];
    rows.push(`${kind} (${cls}): ${g.triangles} tris / ${cap}`);
    if (g.triangles > cap) failures.push(`${f}: ${g.triangles} triangles > ${cap} (${cls})`);
  }
  // texture edge
  const seen = new Set();
  let nTex = 0;
  for (const t of A.textures) {
    const key = `${t.file}#${t.sha1}`;
    if (seen.has(key)) continue;
    seen.add(key); nTex++;
    const cap = t.compressed ? B.textures.maxEdgeKtx2 : B.textures.maxEdgeUncompressed;
    const edge = Math.max(t.width, t.height);
    if (!edge) failures.push(`${t.file}: a texture with no readable size (${t.mime})`);
    else if (edge > cap) failures.push(`${t.file}: ${t.width}×${t.height} ${t.mime.replace('image/', '')} > ${cap} edge${t.compressed ? '' : ' (uncompressed; KTX2 not in the build yet)'}`);
  }
  const ktx2 = A.textures.filter((t) => t.compressed).length;
  const ktx2Files = A.textures.filter((t) => t.mime === 'image/ktx2').length;
  return {
    id: 'asset-budgets',
    status: failures.length ? 'FAIL' : 'PASS',
    summary: `${A.glbs.size} GLBs, ${nTex} textures (${ktx2Files} KTX2, ${ktx2} of them block-compressed); ${failures.length} over a cap`,
    failures,
    notes: rows,
    ms: Date.now() - t0,
  };
}

/**
 * @param {{ root: string, assets?: ReturnType<typeof readAssets> }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function runTextureLedger({ root, assets }) {
  const t0 = Date.now();
  const R = loadBudgets(root).resident;
  const A = assets || readAssets(root);
  /** @type {Record<string, number>} */
  const byLine = Object.fromEntries(R.lines.map((/** @type {any} */ l) => [l.id, 0]));
  const seen = new Set();
  let total = 0;
  let dupes = 0;
  for (const t of A.textures) {
    if (seen.has(t.sha1)) { dupes++; continue; }
    seen.add(t.sha1);
    const b = residentBytes(t);
    total += b;
    byLine[lineOf(t.file, R.lines)] += b;
  }
  const rows = R.lines.map((/** @type {any} */ l) => `${l.label}: ${mb(byLine[l.id])} MB (plan line ${l.estimateMb} MB)${byLine[l.id] / MB > l.estimateMb && l.estimateMb ? ' OVER LINE' : ''}`);
  const failures = total / MB > R.capMb ? [`resident textures ${mb(total)} MB > ${R.capMb} MB`] : [];
  return {
    id: 'texture-ledger',
    status: failures.length ? 'FAIL' : 'PASS',
    summary: `${mb(total)} MB of ${R.capMb} MB resident if all ${seen.size} distinct shipped textures load (${dupes} duplicates counted once; runtime-built textures not counted)`,
    failures,
    notes: rows,
    details: { totalMb: mb(total), byLine: Object.fromEntries(Object.entries(byLine).map(([k, v]) => [k, mb(v)])) },
    ms: Date.now() - t0,
  };
}

/**
 * The deferred set: the files the game fetches only after she is under control, read from the game's own modules
 * (budgets.json shipped.deferred). Each source names a module and an array export of it:
 *   { module, export, under }                      the export lists paths relative to `under`
 *   { module, export, under, file: 'x/{}.glb' }    the export lists ids; each id's path is `file` with the id for {}
 *   except: [{ module, export }]                   ids that something before control loads all the same (they stay in
 *                                                  the first load)
 *   when: 'control' (default) | 'region'          'control': never fetched before control (the audio's late bank);
 *                                                  'region': streamed by where she is, so never in a New Game's first
 *                                                  load (the first load is the boot, the title, the Pans and Saltrow,
 *                                                  TECH 9.4) though a Continue inside the region may fetch it early
 * Paths come back repo-relative ('public/...'), with the source that defers each and its `when`.
 * @param {string} root
 * @param {{ module: string, export: string, under: string, file?: string, except?: { module: string, export: string }[], when?: string }[]} sources
 */
export async function deferredFiles(root, sources = []) {
  /** @type {Map<string, string>} file -> the module that defers it */
  const out = new Map();
  /** @type {Map<string, string>} file -> 'control' | 'region' */
  const when = new Map();
  const errors = [];
  /** @param {string} mod @param {string} name */
  const listOf = async (mod, name) => {
    const abs = path.join(root, mod);
    if (!existsSync(abs)) throw new Error(`${mod} is missing`);
    const m = await import(pathToFileURL(abs).href);
    const list = m[name];
    if (!Array.isArray(list)) throw new Error(`${mod} has no array export ${name}`);
    return list.map(String);
  };
  for (const d of sources) {
    try {
      let list = await listOf(d.module, d.export);
      for (const x of d.except || []) { const no = new Set(await listOf(x.module, x.export)); list = list.filter((id) => !no.has(id)); }
      for (const f of list) {
        const rel = path.posix.join(d.under, d.file ? d.file.replace('{}', f) : f);
        out.set(rel, d.module);
        when.set(rel, d.when || 'control');
      }
    } catch (e) { errors.push(`deferred: ${d.module}: ${String(e?.message || e).slice(0, 200)}`); }
  }
  return { files: out, when, errors };
}

/** The shipped ledger's megabyte: decimal (see the header). */
export const MB10 = 1e6;
/** @param {number} bytes */
const mbd = (bytes) => Math.round((bytes / MB10) * 100) / 100;

/**
 * @param {{ root: string, assets?: ReturnType<typeof readAssets>, dist?: { file: string, bytes: number }[] | null, exit?: string }} o
 * @returns {Promise<import('./lib/files.mjs').CheckResult>}
 */
export async function runShippedLedger({ root, assets, dist = null, exit }) {
  const t0 = Date.now();
  const all = loadBudgets(root);
  const S = all.shipped;
  const ex = exit || all.exit;
  const A = assets || readAssets(root);
  /** @type {Record<string, number>} */
  const byLine = Object.fromEntries(S.lines.map((/** @type {any} */ l) => [l.id, 0]));
  const D = await deferredFiles(root, S.deferred || []);
  const failures = [...D.errors];
  const onDisk = new Set(A.files);
  for (const f of D.files.keys()) if (!onDisk.has(f)) failures.push(`deferred file ${f} (${D.files.get(f)}) is not shipped in public/`);
  let pub = 0, late = 0, lateN = 0;
  /** @type {Record<string, { bytes: number, n: number }>} by `when` */
  const byWhen = {};
  for (const f of A.files) {
    const b = sizeOf(root, f);
    pub += b; byLine[lineOf(f, S.lines)] += b;
    if (D.files.has(f)) {
      late += b; lateN++;
      const w = byWhen[D.when.get(f) || 'control'] ||= { bytes: 0, n: 0 };
      w.bytes += b; w.n++;
    }
  }
  let code = 0;
  for (const d of dist || []) { code += d.bytes; byLine[lineOf(`dist:${d.file}`, S.lines)] += d.bytes; }
  const total = pub + code;
  const boot = pub - late;
  const first = boot + code;
  const cap = S.totalCapMb[ex];
  if (first / MB10 > S.firstLoadCapMb) failures.push(`first load (the boot set ${mbd(boot)} MB + built code ${mbd(code)} MB) ${mbd(first)} MB > ${S.firstLoadCapMb} MB (decimal; ${mb(first)} MiB)`);
  if (cap != null && total / MB10 > cap) failures.push(`total shipped ${mbd(total)} MB > ${cap} MB (${ex} exit; decimal)`);
  const rows = S.lines.map((/** @type {any} */ l) => `${l.label}: ${mbd(byLine[l.id])} MB (plan line ${l.estimateMb} MB)${byLine[l.id] / MB10 > l.estimateMb && l.estimateMb ? ' OVER LINE' : ''}`);
  rows.push(`first load: the boot set ${mbd(boot)} MB (${A.files.length - lateN} files) + built code ${mbd(code)} MB = ${mbd(first)} MB of ${S.firstLoadCapMb} MB (${mb(first)} MiB); margin ${mbd(S.firstLoadCapMb * MB10 - first)} MB`);
  rows.push(`deferred: ${mbd(late)} MB in ${lateN} files, from ${[...new Set(D.files.values())].join(', ') || 'no module'}`);
  if (byWhen.control) rows.push(`  after control (any start): ${mbd(byWhen.control.bytes)} MB in ${byWhen.control.n} files`);
  if (byWhen.region) rows.push(`  by region (never in a New Game's first load): ${mbd(byWhen.region.bytes)} MB in ${byWhen.region.n} files`);
  return {
    id: 'shipped-ledger',
    status: failures.length ? 'FAIL' : dist ? 'PASS' : 'PENDING',
    summary: `first load ${mbd(first)} MB of ${S.firstLoadCapMb} (decimal MB; ${mb(first)} MiB; boot set ${mbd(boot)} MB in ${A.files.length - lateN} files + built code ${dist ? `${mbd(code)} MB` : 'not measured (no build)'}; ${mbd(late)} MB in ${lateN} files deferred: ${byWhen.control ? `${mbd(byWhen.control.bytes)} MB after control` : 'none after control'}, ${byWhen.region ? `${mbd(byWhen.region.bytes)} MB by region` : 'none by region'}); total ${mbd(total)} MB of the ${ex} cap ${cap} MB (public/ ${mbd(pub)} MB in ${A.files.length} files)`,
    failures,
    notes: rows,
    details: { unit: 'MB = 1e6 bytes', firstLoadMb: mbd(first), firstLoadMib: mb(first), marginMb: mbd(S.firstLoadCapMb * MB10 - first), bootMb: mbd(boot), bootFiles: A.files.length - lateN, deferredMb: mbd(late), deferredFiles: lateN, deferredByWhen: Object.fromEntries(Object.entries(byWhen).map(([k, v]) => [k, { mb: mbd(v.bytes), files: v.n }])), totalMb: mbd(total), publicMb: mbd(pub), codeMb: mbd(code), byLine: Object.fromEntries(Object.entries(byLine).map(([k, v]) => [k, mbd(v)])) },
    ms: Date.now() - t0,
  };
}

if (import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { treeRoot } = await import('./lib/files.mjs');
  const root = treeRoot();
  const assets = readAssets(root);
  for (const r of [await runAssetBudgets({ root, assets }), await runTextureLedger({ root, assets }), await runShippedLedger({ root, assets })]) {
    console.log(`${r.status} ${r.id}: ${r.summary}`);
    for (const n of r.notes || []) console.log('  ' + n);
    for (const f of r.failures) console.log('  - ' + f);
  }
}
