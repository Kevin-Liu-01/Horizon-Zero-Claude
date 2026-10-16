/**
 * ROUND 5 — lane `pipeline` gates (docs/ROUND5-PLAN.md §9 "pipeline"; W0a block
 * + the global-list items this lane owns).
 *
 *   R5_SCRATCH=<scratch dir outside the repo> \
 *   node tools/gates.mjs --port 5250 --extra tools/gates.r5.pipeline.mjs --lane pipeline
 *
 * tools/gates.mjs (frozen; gates-perf owns the harness) still merges only
 * `tools/gates.round4.*.mjs` by directory scan, so until gates-perf's
 * A-gates-autodiscover (W0a) imports `tools/gates.r5.*.mjs` by pattern this
 * file goes in through the runner's `--extra <file>` flag — the same import and
 * the same GATES-shape merge a lane file gets. After autodiscovery merges,
 * `--extra` is unnecessary (keeping it only logs "duplicate gate id … keeping
 * the first" per gate; nothing runs twice).
 *
 * W0a gates (plan §3.1): A-ID-ip-assets-gone, A-assets-tracked,
 * A-specs-data-driven. Global list items owned here: A-licence-manifest
 * (complete at W0b: SHA-256 re-fetch + brand's credits wiring are PENDING
 * clauses until then). Loader grant check: A-loader-fixes. Lane guards (not
 * §9 ids): A-pipeline-boot-rows (every boot row loads; no placeholder body
 * exists anywhere), A-pipeline-r30-merge-order (fix round 3: every R30 file
 * and the class that reads it are in the tree together or gone together —
 * PASS in this branch alone, in instruments-core's, and in the merge once
 * instruments-core's §6 deletion of the four machine GLBs is in;
 * docs/ROUND5-PIPELINE.md §4.1).
 *
 * ORDER MATTERS: A-specs-data-driven launches its own headless Chrome, so it
 * runs before any page gate of this file (the harness launches its browser
 * lazily, on the first page gate) — one Chrome alive at a time.
 */
import os from 'node:os';
import path from 'node:path';
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

function walk(rel, exts, out = []) {
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs) || lstatSync(abs).isSymbolicLink()) return out;
  if (lstatSync(abs).isDirectory()) { for (const e of readdirSync(abs)) walk(`${rel}/${e}`, exts, out); } else if (exts.includes(path.extname(rel))) out.push(rel);
  return out;
}

/* ---------------------------------------------------------------- */
/* A-assets-tracked                                                   */
/* ---------------------------------------------------------------- */
async function assetsTracked() {
  const { loadManifest, listFiles, matchRows } = await imp('tools/licences/lib.mjs');
  const specs = await imp('src/core/assets.specs.js');
  // R30 files: a referenced R30 path is "deleted" (listed, not graded) only when it is gone from this tree;
  // a file still served (its reader class is still here, plan §6 row 1) is graded like any other
  const deletedUrls = new Set(Object.values(specs.DELETED).map((r) => `/${r.file.replace(/^public\//, '')}`));
  // 1. every public URL literal in src/** (SPECS rows anywhere: boot rows,
  //    legacy/variety rows, kinds) plus the boot rows themselves
  const refs = new Map();
  const URL_RE = /['"`](\/(?:models|anims|textures|audio|fonts|licences)\/[^'"`\s?#]+\.[a-z0-9]+)['"`]/gi;
  for (const f of walk('src', ['.js', '.mjs'])) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(URL_RE)) if (!m[1].includes('${')) refs.set(`public${m[1]}`, f);
  }
  for (const row of [...Object.values(specs.SPECS), ...Object.values(specs.ANIMS)]) refs.set(`public${row.url}`, 'src/core/assets.specs.js');
  // 2. every file a LICENSES.json row matches, and every non-glob row path
  const manifest = loadManifest();
  const files = listFiles('public');
  const { byFile } = matchRows(manifest, files);
  for (const [f, ids] of byFile) if (ids.length) refs.set(f, `LICENSES.json:${ids[0]}`);
  // a legacy row's exact path whose file is gone: its scheduled deletion has landed (another lane may own
  // it, e.g. gates-perf's W0a anims deletion). Not a tracking failure: listed by name for row cleanup.
  const landed = new Map();
  for (const r of manifest.rows) {
    for (const p of r.paths) {
      if (!p.startsWith('public/') || /[*?{]/.test(p)) continue;
      if (r.legacy && r.delete_at && !existsSync(path.join(ROOT, p))) { landed.set(p, { path: p, row: r.id, delete_at: r.delete_at, owner: r.delete_owner }); continue; }
      refs.set(p, `LICENSES.json:${r.id}`);
    }
  }
  const all = [...refs.keys()].sort();
  const deleted = all.filter((p) => deletedUrls.has(p.replace(/^public/, '')) && !existsSync(path.join(ROOT, p)));
  const live = all.filter((p) => !deleted.includes(p));
  const missing = live.filter((p) => !existsSync(path.join(ROOT, p)));
  // git check-ignore: exit 0 = some ignored (listed), 1 = none ignored; anything else (not a repo, no git)
  // is an error, never read as "not ignored"
  const ignore = (paths) => {
    if (!paths.length) return [];
    try {
      return execFileSync('git', ['check-ignore', '--no-index', '--stdin'], { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
        .split('\n').filter(Boolean);
    } catch (e) {
      if (e.status === 1) return (e.stdout || '').split('\n').filter(Boolean);
      throw new Error(`git check-ignore failed (exit ${e.status}): ${String(e.stderr || e.message).trim().slice(0, 200)}`);
    }
  };
  const ignoredRefs = ignore(live);
  // 3. the rules themselves, on synthetic paths (they need not exist). The
  //    Tiller fixture's URL (/models/r5-poc/tiller.glb, read by
  //    src/instruments/kinds/tiller.js once instruments-core merges) is the one
  //    tracked file under r5-poc/; every other proof output stays ignored.
  const mustTrack = ['public/models/hero/brea-body.glb', 'public/models/instruments/tiller.glb', 'public/models/a/b/c.glb', 'public/models/pipeline/probe.glb',
    'public/models/r5-poc/tiller.glb'];
  const mustIgnore = ['public/models/x.baked.glb', 'public/models/hero/x.baked.glb', 'public/models/x.orig', 'public/models/a/b/x.orig',
    'models-staging/r5-src', 'models-staging/r5-src/ubc/x.glb', 'models-staging/r5-src/ual2.zip',
    'public/models/r5-poc/sounding-ring.glb', 'public/models/r5-poc/x.glb', 'public/models/r5-poc/tiller.baked.glb'];
  const wronglyIgnored = ignore(mustTrack);
  const ig = new Set(ignore(mustIgnore));
  const notIgnored = mustIgnore.filter((p) => !ig.has(p));
  // 4. NEGATIVE CONTROL (fix round 2, the judge's merged-tree defect): a src
  //    URL literal that names an ignored proof output is caught by the same
  //    reference pipeline — a fresh clone would not have that file
  const CONTROL = 'public/models/r5-poc/sounding-ring.glb';
  const controlCaught = ignore([...live, CONTROL]).includes(CONTROL);
  const fixtureUrl = 'public/models/r5-poc/tiller.glb';
  const fixture = { exists: existsSync(path.join(ROOT, fixtureUrl)), ignored: ignore([fixtureUrl]).length > 0, referencedBy: refs.get(fixtureUrl) ?? null };
  const pass = !ignoredRefs.length && !missing.length && !wronglyIgnored.length && !notIgnored.length && controlCaught
    && fixture.exists && !fixture.ignored;
  return {
    pass,
    detail: {
      referenced: all.length, ignoredRefs, missing, deletedR30: deleted,
      r30StillServed: all.filter((p) => deletedUrls.has(p.replace(/^public/, '')) && !deleted.includes(p)),
      scheduledDeletionsLanded: [...landed.values()],
      rules: { mustTrack: mustTrack.length, wronglyIgnored, mustIgnore: mustIgnore.length, notIgnored },
      tillerFixture: fixture, negativeControl: { literal: CONTROL, caught: controlCaught },
    },
  };
}

/* ---------------------------------------------------------------- */
/* A-specs-data-driven                                                */
/* ---------------------------------------------------------------- */
async function specsDataDriven({ PORT }) {
  // static half: the loader names no row and holds no asset URL
  const loader = readFileSync(path.join(ROOT, 'src/core/assets.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const specs = await imp('src/core/assets.specs.js');
  const names = [...Object.keys(specs.SPECS), ...Object.keys(specs.ANIMS), ...Object.keys(specs.DELETED)];
  const named = names.filter((n) => new RegExp(`['"\`.]${n}\\b|\\b${n}\\s*:`).test(loader));
  const urls = (loader.match(/['"`]\/(models|anims|textures)\/[^'"`]*['"`]/g) || []);
  const { specsArePureData } = await imp('tools/build/pipeline/specs-fixture.mjs');
  const pure = await specsArePureData(path.join(ROOT, 'src/core/assets.specs.js'));
  const staticOk = !named.length && !urls.length && pure.ok;
  // dynamic half: delete the fixture row + file in a scratch copy, boot it —
  // in a child process (own Chrome-semaphore ticket, own crash domain)
  const scratch = process.env.R5_SCRATCH || path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline');
  const dyn = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'tools/build/pipeline/specs-fixture.mjs'), '--root', ROOT, '--scratch', scratch, '--port', String(PORT)],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const kill = setTimeout(() => child.kill('SIGTERM'), 840000);
    child.on('close', (code) => {
      clearTimeout(kill);
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ pass: false, detail: { error: `fixture child exited ${code} with no result` } }); }
    });
  });
  const pass = !staticOk ? false : dyn.pass;
  return { pass, detail: { static: { rowNamesInLoader: named, urlLiteralsInLoader: urls, specsPureData: pure }, dynamic: dyn.detail } };
}

/* ---------------------------------------------------------------- */
/* page-side asserts                                                  */
/* ---------------------------------------------------------------- */
const LOADER_FIXES = `(async () => {
  const A = __CTX__.assets;
  const ref = await (await fetch('/tools/build/pipeline/probe.ref.json')).json();
  const URL = '/models/pipeline/probe.glb';
  const LABEL = { 'probe-plinth': 0, 'probe-post': 1, 'probe-lamp': 2 };
  const lod = await import('/src/entities/machines/rig/lod.js');

  // (0) the RAW stream layout, to show why getX is needed
  const raw = await A.loader.loadAsync(URL);
  let rawBone = null;
  raw.scene.traverse((o) => { if (o.isMesh && !rawBone && o.geometry.attributes._bone) rawBone = o.geometry.attributes._bone; });
  const rawLayout = rawBone ? { count: rawBone.count, arrayLength: rawBone.array.length, interleaved: !!rawBone.isInterleavedBufferAttribute, stride: rawBone.data?.stride ?? rawBone.itemSize } : null;
  const rawPos = []; raw.scene.traverse((o) => { if (o.isMesh) rawPos.push({ name: o.name, type: o.geometry.attributes.position.array.constructor.name, normalized: o.geometry.attributes.position.normalized }); });
  // NEGATIVE CONTROL (reported, graded only as "the hazard is real"): the
  // re-bake rig/lod.js unifySkin does (geometry.applyMatrix4 on a clone, here
  // a x3 scale and back) on the RAW quantised stream vs the dequantised one
  let rawMesh = null; raw.scene.traverse((o) => { if (o.isMesh && !rawMesh) rawMesh = o; });
  raw.scene.updateMatrixWorld(true);
  const nodeScale = rawMesh.matrixWorld.getMaxScaleOnAxis();
  const P0 = rawMesh.geometry.attributes.position;
  const ref0 = new Float32Array(P0.count * 3);
  for (let i = 0; i < P0.count; i++) for (let c = 0; c < 3; c++) ref0[i * 3 + c] = P0.getComponent(i, c);
  const S3 = new rawMesh.matrixWorld.constructor().makeScale(3, 3, 3);
  const rebakeErr = (geo) => {
    geo.applyMatrix4(S3);
    const Q = geo.attributes.position; let w = 0;
    for (let i = 0; i < Q.count; i++) for (let c = 0; c < 3; c++) w = Math.max(w, Math.abs(Q.getComponent(i, c) / 3 - ref0[i * 3 + c]));
    geo.dispose();
    return w * nodeScale;
  };
  const negRaw = rebakeErr(rawMesh.geometry.clone());
  const fg = rawMesh.geometry.clone();
  fg.setAttribute('position', new rawMesh.geometry.attributes.position.constructor(new Float32Array(ref0), 3));
  const negDeq = rebakeErr(fg);
  raw.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach((m) => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); } });

  // (1) loadExtra with the shared loader (dequantise row flag)
  await A.loadExtra({ 'probe-gate': { url: URL, targetHeight: 0.6, yaw: 0, dequantise: true } }, { force: true });
  const e = A.models['probe-gate'];
  const src = e.gltf.scene; src.updateMatrixWorld(true);
  const M4 = src.matrixWorld.constructor, V3 = src.position.constructor;
  const inv = new M4().copy(src.matrixWorld).invert();
  const rel = new M4(), v = new V3();
  let maxErr = 0, verts = 0, quantisedLeft = [], labelErr = [], meshes = [];
  const before = [];
  src.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry, P = g.attributes.position, r = ref.meshes[o.name];
    rel.multiplyMatrices(inv, o.matrixWorld);
    for (const [k, a] of Object.entries(g.attributes)) {
      if (k === '_bone' || k.startsWith('skin')) continue;
      if (a.normalized || a.isInterleavedBufferAttribute || !(a.array instanceof Float32Array)) quantisedLeft.push(o.name + '.' + k);
    }
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(rel);
      before.push(v.x, v.y, v.z);
      if (r) maxErr = Math.max(maxErr, Math.hypot(v.x - r[i * 3], v.y - r[i * 3 + 1], v.z - r[i * 3 + 2]));
    }
    verts += P.count;
    const L = g.userData.r5Labels;
    if (!L || L.length !== P.count || L.some((x) => x !== LABEL[o.name])) labelErr.push(o.name);
    meshes.push({ name: o.name, verts: P.count, refVerts: r ? r.length / 3 : null, castShadow: o.castShadow, noShadow: !!o.userData.noShadow });
  });
  const lamp = meshes.find((m) => m.name === 'probe-lamp');
  const lampOk = !!lamp && lamp.castShadow === false && meshes.filter((m) => m.name !== 'probe-lamp').every((m) => m.castShadow);
  const refOk = meshes.every((m) => m.refVerts === m.verts);

  // (2) fold through rig/lod.js on a machine-shaped holder, then nearest-vertex error
  const model = e.root.clone(true);
  const holder = { model, kind: 'probe-gate', modelKind: 'probe-gate', _eyeMats: [], _emisMats: [] };
  const created = [];
  const fold = lod.foldMachineMeshes(holder, { pool: false });
  model.updateMatrixWorld(true);
  const srcLocal = new M4();
  // 'before' is in gltf-scene space; bring the folded vertices into the same space
  const scn = model.children[0].children[0]; // inner > gltf scene
  const scnInv = new M4().copy(scn.matrixWorld).invert();
  const after = [];
  let afterMeshes = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    afterMeshes++;
    if (o.userData.merged) created.push(o);
    srcLocal.multiplyMatrices(scnInv, o.matrixWorld);
    const P = o.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(srcLocal); after.push(v.x, v.y, v.z); }
  });
  // the merge de-indexes, so compare the two vertex SETS both ways: no folded
  // vertex away from the source (moved), no source vertex left uncovered (lost)
  const nearest = (P, Q) => {
    let worst = 0;
    for (let i = 0; i < P.length; i += 3) {
      let best = Infinity;
      for (let j = 0; j < Q.length; j += 3) {
        const d = (P[i] - Q[j]) ** 2 + (P[i + 1] - Q[j + 1]) ** 2 + (P[i + 2] - Q[j + 2]) ** 2;
        if (d < best) best = d;
      }
      worst = Math.max(worst, Math.sqrt(best));
    }
    return worst;
  };
  const foldErr = nearest(after, before);
  const coverErr = nearest(before, after);
  for (const o of created) o.geometry.dispose();

  // dispose the entry itself
  const freed = A.unload('probe-gate');
  const gone = !A.models['probe-gate'];

  const pass = maxErr <= 0.001 && foldErr <= 0.001 && coverErr <= 0.001 && !quantisedLeft.length && !labelErr.length
    && lampOk && refOk && gone && !!rawLayout && rawLayout.arrayLength !== rawLayout.count
    && negRaw > 0.001 && negDeq <= 0.001;
  return { pass, detail: {
    dequantisedMaxErrMm: +(maxErr * 1000).toFixed(4), foldMaxErrMm: +(foldErr * 1000).toFixed(4),
    foldCoverErrMm: +(coverErr * 1000).toFixed(4),
    negControlRebakeMm: { rawQuantised: +(negRaw * 1000).toFixed(1), dequantised: +(negDeq * 1000).toFixed(4) },
    verts, foldedVerts: after.length / 3, meshesBefore: meshes.length, meshesAfterFold: afterMeshes, fold,
    quantisedLeft, labelErr, lampCastShadow: lamp?.castShadow, lampOk, refOk,
    rawBoneStream: rawLayout, rawPositions: rawPos, provenance: e.provenance, dequantisedAttrs: e.dequantised,
    disposed: freed, entryGone: gone,
  } };
})()`;

const BOOT_ROWS = `(async () => {
  const A = __CTX__.assets, M = __CTX__.machines;
  for (let i = 0; i < 40 && M && !M.expansionReady; i++) await new Promise((r) => setTimeout(r, 250));
  const { DELETED } = await import('/src/core/assets.specs.js');
  const kinds = Object.keys(DELETED);
  const specs = Object.keys(A.specs);
  const loaded = specs.filter((n) => !!A.models[n]);
  const skipped = A.skipped.map((s) => ({ name: s.name, status: s.status }));
  const failed = A.skipped.filter((s) => s.status === 'SKIP-load-failed');
  const r30 = A.r30 || { deleted: [], pending: [] };
  // every R30 kind is exactly one of: deleted (SKIP-legacy-deleted, answered by legacyDeleted()) or
  // pending (its file still served because its reader class is here: a boot row loaded from that file)
  const unaccounted = kinds.filter((k) => (r30.deleted || []).includes(k) === (r30.pending || []).includes(k));
  const unreported = (r30.deleted || []).filter((k) => A.legacyDeleted?.(k)?.status !== 'SKIP-legacy-deleted');
  const pendingNotReal = (r30.pending || []).filter((k) => !A.models[k] || A.models[k].spec?.url !== DELETED[k].row?.url
    || !A.models[k].gltf?.parser?.json?.asset);
  const ownDeletionPending = (r30.pending || []).filter((k) => DELETED[k].owner === 'pipeline');
  const falsePositive = specs.filter((k) => A.legacyDeleted?.(k));
  // NO PLACEHOLDER BODY (fix round 3): no model entry flagged as one, no mesh or material named as one
  const placeholderEntries = Object.entries(A.models).filter(([, e]) => e.standIn || e.spec?.standIn).map(([n]) => n);
  const placeholderMeshes = [];
  (__CTX__.scene || __CTX__.engine?.scene)?.traverse?.((o) => {
    if (!o.isMesh) return;
    const mats = [].concat(o.material || []);
    if (/stand-?in|bridge/i.test(o.name || '') || mats.some((m) => /stand-?in/i.test(m?.name || ''))) placeholderMeshes.push(o.name);
  });
  // live machines built on an R30 body: each must stand on a real (pending) body, none on a deleted kind
  const r30Machines = {}, onDeletedBody = [];
  for (const m of (M?.list || [])) {
    if (m._disposed || !kinds.includes(m.modelKind)) continue;
    r30Machines[m.kind] = (r30Machines[m.kind] || 0) + 1;
    if (!(r30.pending || []).includes(m.modelKind) || !A.models[m.modelKind]) onDeletedBody.push(m.kind);
  }
  const campNpcs = Array.isArray(__CTX__.camp?.npcs) ? __CTX__.camp.npcs.length : 0;
  const pass = loaded.length === specs.length && !failed.length && !!A.models.hero && (r30.deleted || []).length >= 1
    && !unaccounted.length && !unreported.length && !pendingNotReal.length && !ownDeletionPending.length && !falsePositive.length
    && !placeholderEntries.length && !placeholderMeshes.length && !onDeletedBody.length;
  return { pass, detail: { bootRows: specs, loaded, skipped, r30, unaccounted, unreported, pendingNotReal, ownDeletionPending,
    falsePositive, placeholderEntries, placeholderMeshes: placeholderMeshes.slice(0, 8), r30Machines, onDeletedBody, campNpcs,
    heroUrl: A.specs.hero?.url ?? null } };
})()`;

/* ---------------------------------------------------------------- */
/* A-pipeline-r30-merge-order (lane guard)                            */
/* ---------------------------------------------------------------- */
/**
 * Fix round 3 (judge's option (b), plan §6): the R30 deletion is split by
 * OWNER. Pipeline deletes `npc.glb` (+ README) in this branch. The four
 * machine GLBs are instruments-core's (§6 row 1), deleted in ONE change with
 * the classes that read them; `assets.js` serves such a file only while its
 * reader is present. So every branch, alone or merged in any order, holds
 * each file and its reader together or neither. This guard reads the tree:
 *   PASS  every instruments-core R30 row is CONSISTENT: file + reader both
 *         present (pending: that lane's change not merged yet) or both gone;
 *         every pipeline-owned R30 file is gone; no class imports a deleted
 *         class; the SCHEDULED_IP (licence) table agrees with DELETED; the
 *         camp.js guard is in place while camp.js exists;
 *   FAIL  HALF STATE: a file gone while its reader class is still here (the
 *         class would boot without a body — what the capsule era was);
 *   FAIL  ORPHAN: a reader gone while the IP file is still on disk (nothing
 *         loads it; it must be deleted — instruments-core, or the orchestrator
 *         in the merge commit: `git rm public/models/{watcher,sawtooth,behemoth,thunderjaw}.glb`);
 *   FAIL  a pipeline-owned R30 file back on disk.
 */
async function r30MergeOrder() {
  const specs = await imp('src/core/assets.specs.js');
  const { SCHEDULED_IP } = await imp('tools/licences/lib.mjs');
  const rows = Object.entries(specs.DELETED).map(([kind, r]) => ({
    kind, owner: r.owner, file: r.file, onDisk: existsSync(path.join(ROOT, r.file)),
    reader: r.reader ?? null, readerPresent: r.reader ? existsSync(path.join(ROOT, r.reader)) : null,
  }));
  const problems = [];
  const pending = [], done = [];
  for (const r of rows) {
    if (r.owner === 'pipeline') {
      if (r.onDisk) problems.push(`${r.file}: this lane's R30 deletion is undone (file on disk)`); else done.push(r.kind);
      continue;
    }
    if (!r.reader || !r.reader.startsWith('src/entities/machines/')) { problems.push(`${r.kind}: an R30 row deleted with its class needs a reader under src/entities/machines/`); continue; }
    if (!r.onDisk && r.readerPresent) problems.push(`${r.kind}: HALF STATE — ${r.file} is gone but its reader ${r.reader} is still here (the class would boot without a body)`);
    else if (r.onDisk && !r.readerPresent) problems.push(`${r.kind}: ORPHANED IP FILE — ${r.reader} is gone but ${r.file} is still on disk: delete it (owner ${r.owner}, plan §6 row 1)`);
    else (r.onDisk ? pending : done).push(r.kind);
    const ex = SCHEDULED_IP[r.file];
    if (!ex || !ex.rowless || ex.owner !== r.owner || ex.reader !== r.reader) problems.push(`${r.kind}: lib.mjs SCHEDULED_IP disagrees with assets.specs.js DELETED (owner / reader / rowless)`);
  }
  // a class importing the class of a deleted kind (a chassis: redeye on watcher) goes with it
  const goneReaders = rows.filter((r) => r.reader && !r.readerPresent).map((r) => path.basename(r.reader));
  const chassis = walk('src/entities/machines', ['.js']).filter((f) => {
    const t = readFileSync(path.join(ROOT, f), 'utf8');
    return goneReaders.some((b) => new RegExp(`from\\s+['"]\\./${b.replace('.', '\\.')}['"]`).test(t));
  });
  for (const f of chassis) problems.push(`${f} imports a deleted R30 class`);
  const camp = path.join(ROOT, 'src/world/camp.js');
  const campGuard = existsSync(camp) ? /if \(this\.ctx\.assets\.models\.npc\) this\._placeNpc\(\)/.test(readFileSync(camp, 'utf8')) : null;
  if (campGuard === false) problems.push('src/world/camp.js: the npc.glb guard is missing');
  const detail = { rows, pending, done, chassisImportsOfDeletedClasses: chassis, campGuard, problems,
    why: problems.length ? problems.join('; ')
      : pending.length ? `consistent: ${pending.join(', ')} still served WITH their reader classes (instruments-core's §6 deletion of file + class not merged yet); ${done.join(', ')} gone`
        : `consistent: every R30 file and its reader gone (${done.join(', ')})` };
  return { pass: !problems.length, detail };
}

export const GATES = [
  {
    id: 'A-ID-ip-assets-gone', kind: 'runner', lane: 'pipeline', timeout: 120000,
    title: 'No IP/NC asset in the working tree: every public GLB read with gltf-transform, provenance licence in the allowed set, no NC/ND declared in any manifest (R30)',
    check: async () => {
      const { scan, selfTest } = await imp('tools/licences/ip-scan.mjs');
      const r = await scan();
      const { licences, ...rest } = r;
      // the detectors must fire on a planted IP/NC/no-provenance control (outside the repo)
      const control = await selfTest(path.join(process.env.R5_SCRATCH || path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline'), `ip-control-${process.pid}`));
      return { pass: r.pass && control.ok, detail: { ...rest, negativeControl: control } };
    },
  },
  {
    id: 'A-assets-tracked', kind: 'runner', lane: 'pipeline', timeout: 60000,
    title: 'Every path a SPECS row or a LICENSES.json row references is tracked (not gitignored); bake artefacts and models-staging/r5-src stay ignored',
    check: assetsTracked,
  },
  {
    id: 'A-licence-manifest', kind: 'runner', lane: 'pipeline', timeout: 60000,
    title: 'public/LICENSES.json covers every public file exactly once; rows valid; MIT code rows; CC-BY attributions in README + in-game credits; public/ <= 60 MB',
    check: async () => {
      const { check } = await imp('tools/licences/check.mjs');
      const r = await check();
      const summary = Object.fromEntries(Object.entries(r.clauses).map(([k, c]) => [k, c.status]));
      return { pass: r.pass, detail: { summary, clauses: r.clauses } };
    },
  },
  {
    id: 'A-specs-data-driven', kind: 'runner', lane: 'pipeline', timeout: 900000,
    title: 'SPECS are data: assets.js names no row; with the fixture row and its file removed in a scratch copy, A1 and A20b pass with 0 code edits',
    check: specsDataDriven,
  },
  {
    id: 'A-loader-fixes', kind: 'action', lane: 'pipeline', timeout: 90000, settle: 1500,
    title: 'Shared loader on a quantised generated GLB: dequantised error <= 1 mm, fold through rig/lod.js moves no vertex > 1 mm, labels via getX, lamp casts no shadow, entry disposes',
    assert: LOADER_FIXES,
  },
  {
    id: 'A-pipeline-boot-rows', kind: 'action', lane: 'pipeline', timeout: 60000, settle: 6000,
    title: 'Lane guard: every boot row loads, no SKIP-load-failed; every R30 kind is either SKIP-legacy-deleted through assets.legacyDeleted() or a real body still served with its class; no placeholder body anywhere',
    assert: BOOT_ROWS,
  },
  {
    id: 'A-pipeline-r30-merge-order', kind: 'runner', lane: 'pipeline', timeout: 30000,
    title: 'Lane guard: every R30 file and the class that reads it are present together or gone together (no half state, no orphaned IP file); npc.glb gone; licence table agrees',
    check: r30MergeOrder,
  },
];
