// @ts-check
/**
 * Tier 0 asset budgets, read from files (no browser):
 *   asset-budgets     per-asset caps: Brea as worn, near-tier people, Instruments by class, texture edge
 *   texture-ledger    summed resident texture memory against the cap
 *   shipped-ledger    summed shipped bytes against the first-load cap and the milestone total cap
 *
 *   node tools/tier0/budgets.mjs [--tree <dir>]
 *
 * Numbers live in tools/tier0/budgets.json. GLBs are parsed by lib/glb.mjs.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { listFiles, sizeOf, mb, MB } from './lib/files.mjs';
import { inspectGlb, imageSize, residentBytes } from './lib/glb.mjs';

const IMAGE = /\.(png|jpe?g|webp|ktx2)$/i;

/** @param {string} root */
export function loadBudgets(root) {
  return JSON.parse(readFileSync(path.join(root, 'tools/tier0/budgets.json'), 'utf8'));
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
  /** @type {{ file: string, sha1: string, width: number, height: number, compressed: boolean, mime: string }[]} */
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
      textures.push({ file: f, sha1: `file:${f}`, width: sz.width, height: sz.height, compressed: sz.mime === 'image/ktx2', mime: sz.mime });
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
  return {
    id: 'asset-budgets',
    status: failures.length ? 'FAIL' : 'PASS',
    summary: `${A.glbs.size} GLBs, ${nTex} textures (${ktx2} KTX2); ${failures.length} over a cap`,
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
  let pub = 0;
  for (const f of A.files) { const b = sizeOf(root, f); pub += b; byLine[lineOf(f, S.lines)] += b; }
  let code = 0;
  for (const d of dist || []) { code += d.bytes; byLine[lineOf(`dist:${d.file}`, S.lines)] += d.bytes; }
  const total = pub + code;
  const cap = S.totalCapMb[ex];
  const failures = [];
  if (total / MB > S.firstLoadCapMb) failures.push(`first load (static: everything; no streaming yet) ${mb(total)} MB > ${S.firstLoadCapMb} MB`);
  if (cap != null && total / MB > cap) failures.push(`total shipped ${mb(total)} MB > ${cap} MB (${ex} exit)`);
  const rows = S.lines.map((/** @type {any} */ l) => `${l.label}: ${mb(byLine[l.id])} MB (plan line ${l.estimateMb} MB)${byLine[l.id] / MB > l.estimateMb && l.estimateMb ? ' OVER LINE' : ''}`);
  return {
    id: 'shipped-ledger',
    status: failures.length ? 'FAIL' : dist ? 'PASS' : 'PENDING',
    summary: `${mb(total)} MB shipped = public/ ${mb(pub)} MB (${A.files.length} files) + built code ${dist ? `${mb(code)} MB` : 'not measured (no build)'}; first-load cap ${S.firstLoadCapMb} MB, ${ex} total cap ${cap} MB`,
    failures,
    notes: rows,
    details: { totalMb: mb(total), publicMb: mb(pub), codeMb: mb(code), byLine: Object.fromEntries(Object.entries(byLine).map(([k, v]) => [k, mb(v)])) },
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
