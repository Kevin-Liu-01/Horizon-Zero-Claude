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
 * A-specs-data-driven. W0b gates (plan §9 pipeline): A-sources-staged,
 * A-build-deterministic, A-build-only-lane, A-glb-budget, A-human-bind,
 * A-poc-promoted (W0 exit), A-loader-fixes. Global list items owned here:
 * A-licence-manifest, A-ID-ip-assets-gone, A-assets-tracked. Lane guards (not
 * §9 ids): A-pipeline-boot-rows (every boot row loads; no placeholder body
 * exists anywhere), A-pipeline-r30-merge-order (fix round 3: every R30 file
 * and the class that reads it are in the tree together or gone together —
 * PASS in this branch alone, in instruments-core's, and in the merge once
 * instruments-core's §6 deletion of the four machine GLBs is in;
 * docs/ROUND5-PIPELINE.md §4.1).
 *
 * ORDER MATTERS: A-specs-data-driven and A-poc-promoted launch their own
 * headless Chrome (in a child process), so they run before any page gate of
 * this file (the harness launches its browser lazily, on the first page
 * gate) — one Chrome alive at a time. A-build-deterministic runs two full
 * builds (~1 min CPU each; minutes of wall on a loaded box).
 *
 * W0b fix round 1: A-licence-manifest is a PAGE gate (its in-game credits
 * clause is graded on the rendered credits modal, never on menu.js source);
 * A-poc-promoted grades the literal bar (never PASS with a file left in
 * tools/r5-poc/ or public/models/r5-poc/; every string-literal reference to
 * them is classified); the licence gates grade against the TRUE wave (lane
 * branch r5/<wave>-<lane>, R5_WAVE, or the lane-report lower bound with the
 * §2-named report files counted).
 *
 * W0b fix round 2 (after the Oct 22 reboot emptied models-staging/r5-src):
 * build:assets keeps going past a failing recipe and lists it with
 * `missingSource`; A-build-deterministic / A-build-only-lane report PENDING
 * `blockedBy: 'A-sources-staged'` (never PASS) only when every failure is a
 * missing staged source AND A-sources-staged itself reports the files missing
 * (classification has its own negative control); any other recipe failure is
 * FAIL. `tools/build/sources.mjs restore` puts the lock's files back.
 *
 * W0b fix round 3: A-sources-staged also runs the ARCHIVE IDENTITY controls
 * (tools/build/pipeline/archive-controls.mjs, 11 cases in scratch): a re-zip of
 * the staged subset, a size-forged re-zip, a renamed zip, a changed member and
 * a keep-all stage-zip are refused with the lock and row untouched; the
 * positive cases record a name- and size-checked hash with its member listing;
 * hand-edited lock/row records are caught by the shared `archiveAgreement`
 * term that status() and tools/licences/check.mjs (third-party) grade.
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
  //    two ?poc=biome closure GLBs under r5-poc/ are tracked (the Tiller copy is
  //    also what src/instruments/kinds/tiller.js reads until instruments-core
  //    re-points it); every other proof output stays ignored.
  const mustTrack = ['public/models/hero/brea-body.glb', 'public/models/instruments/tiller.glb', 'public/models/a/b/c.glb', 'public/models/pipeline/probe.glb',
    'public/models/r5-poc/tiller.glb', 'public/models/r5-poc/sounding-ring.glb'];
  const mustIgnore = ['public/models/x.baked.glb', 'public/models/hero/x.baked.glb', 'public/models/x.orig', 'public/models/a/b/x.orig',
    'models-staging/r5-src', 'models-staging/r5-src/ubc/x.glb', 'models-staging/r5-src/ual2.zip',
    'public/models/r5-poc/proof-output.glb', 'public/models/r5-poc/x.glb', 'public/models/r5-poc/tiller.baked.glb'];
  const wronglyIgnored = ignore(mustTrack);
  const ig = new Set(ignore(mustIgnore));
  const notIgnored = mustIgnore.filter((p) => !ig.has(p));
  // 4. NEGATIVE CONTROL (fix round 2, the judge's merged-tree defect): a src
  //    URL literal that names an ignored proof output is caught by the same
  //    reference pipeline — a fresh clone would not have that file
  const CONTROL = 'public/models/r5-poc/proof-output.glb';
  const controlCaught = ignore([...live, CONTROL]).includes(CONTROL);
  // the Tiller fixture's model, wherever instruments-core's kind file points it (W0a: /models/r5-poc/tiller.glb;
  // after the W0-exit re-point: /models/instruments/tiller.glb) — read from the file, not assumed
  const tillerSrc = path.join(ROOT, 'src/instruments/kinds/tiller.js');
  const tillerUrl = existsSync(tillerSrc) ? (/['"`](\/models\/[^'"`]+\.glb)['"`]/.exec(readFileSync(tillerSrc, 'utf8'))?.[1] ?? null) : null;
  const fixtureUrl = tillerUrl ? `public${tillerUrl}` : null;
  const fixture = fixtureUrl ? { url: tillerUrl, exists: existsSync(path.join(ROOT, fixtureUrl)), ignored: ignore([fixtureUrl]).length > 0, referencedBy: refs.get(fixtureUrl) ?? null }
    : { url: null, note: 'no Tiller kind file in this tree' };
  const pass = !ignoredRefs.length && !missing.length && !wronglyIgnored.length && !notIgnored.length && controlCaught
    && (!fixtureUrl || (fixture.exists && !fixture.ignored));
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


/* ---------------------------------------------------------------- */
/* W0b: A-sources-staged (+ negative control), child-process Chrome   */
/* ---------------------------------------------------------------- */
const scratchRoot = () => process.env.R5_SCRATCH || path.join(os.tmpdir(), 'calima-r5-scratch', 'pipeline');

async function sourcesStaged() {
  const S = await imp('tools/build/sources.mjs');
  const r = await S.status();
  // NEGATIVE CONTROL: a copy-on-write clone of r5-src with one staged byte changed and one stray file must FAIL
  let control = { ok: null };
  const src = S.srcDir();
  if (existsSync(src)) {
    const { mkdirSync, rmSync, appendFileSync, writeFileSync, realpathSync } = await import('node:fs');
    mkdirSync(scratchRoot(), { recursive: true });
    const tamper = path.join(realpathSync(scratchRoot()), `r5-src-control-${process.pid}`);
    rmSync(tamper, { recursive: true, force: true });
    try {
      execFileSync('cp', ['-cR', realpathSync(src), tamper]);
      const lock = S.loadLock();
      // fix round 2: tamper with a file that IS staged (after the Oct 22 reboot only ual1 is; the first lock entry's
      // files were missing and the control threw ENOENT instead of grading)
      const pick = Object.entries(lock.sources).flatMap(([row, ent]) => Object.keys(ent.files).sort()
        .map((f) => ({ row, dir: ent.dir || row, f }))).find((x) => existsSync(path.join(tamper, x.dir, x.f)));
      if (!pick) control = { ok: null, why: 'no staged file on disk to tamper with (every lock file is missing)' };
      else {
        appendFileSync(path.join(tamper, pick.dir, pick.f), 'x');
        writeFileSync(path.join(tamper, pick.dir, 'stray.bin'), 'stray');
        const c = await S.status({ env: { ...process.env, R5_SRC: tamper } });
        const caught = c.pass === false && c.detail.problems.some((x) => x.includes(`${pick.row}: 1 staged file(s) differ`)) && c.detail.problems.some((x) => x.includes('not in the lock'));
        control = { ok: caught, tampered: `${pick.row}/${pick.f}`, problems: c.detail.problems.filter((x) => x.startsWith(pick.row)).slice(0, 3) };
      }
    } finally { rmSync(tamper, { recursive: true, force: true }); }
  }
  // fix round 3 — ARCHIVE IDENTITY controls (judge: a self-made zip's hash was recorded as the upstream archive's):
  // 11 cases in scratch on the real restore / verify-zip / stage-zip / archiveAgreement code (refusals leave the lock and
  // the row untouched; the positive cases record name-checked hash + size + listing). tools/build/pipeline/archive-controls.mjs
  const { archiveControls } = await imp('tools/build/pipeline/archive-controls.mjs');
  let archive;
  try { archive = await archiveControls({ scratch: scratchRoot() }); } catch (e) { archive = { ok: false, error: String(e?.stack || e).slice(0, 400) }; }
  const archiveSummary = { ok: archive.ok, row: archive.row, error: archive.error, why: archive.why,
    cases: (archive.cases || []).map((c) => ({ case: c.case, ok: c.ok, ...(c.restore ? { restore: c.restore.ok, problems: (c.restore.problems || []).length } : {}),
      ...(c.verifyZip ? { verifyZip: c.verifyZip.ok } : {}), ...(c.stageZip ? { stageZip: c.stageZip.ok } : {}), ...(c.tampered ? { tampered: c.tampered } : {}) })) };
  const pass = control.ok === false || archive.ok === false ? false : r.pass;
  return { pass, detail: { ...r.detail, negativeControl: control, archiveIdentityControls: archiveSummary } };
}

function childJson(script, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const kill = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => {
      clearTimeout(kill);
      try { resolve(JSON.parse(out.trim().split('\n').pop())); } catch { resolve({ pass: false, detail: { error: `${script} exited ${code} with no result` } }); }
    });
  });
}

async function pocPromoted({ PORT }) {
  const W = await imp('tools/build/pipeline/w0b-checks.mjs');
  const st = W.pocPromotedStatic();
  // dynamic: ?poc=biome still serves (its own Chrome, in a child, before any page gate)
  const dyn = await childJson('tools/build/pipeline/biome-check.mjs', ['--scratch', scratchRoot(), '--port', String(PORT)], 600000);
  // literal: PASS needs (a) + (b) absent folders + (c) biome serving; the static half is null (ruling) at best while
  // the closure files exist, so the gate cannot PASS with anything left in either folder
  // fix round 3: under the recorded ruling poc-closure=literal clause (c) is struck (the probe is reported, not graded);
  // with no ruling or poc-closure=w1-exit it is graded. No ruling = the literal bar, at best PENDING (w0b-checks.mjs)
  const struck = st.detail.ruling === 'poc-closure=literal';
  const pass = st.pass === false || (!struck && dyn.pass === false) ? false : st.pass === true && (struck || dyn.pass === true) ? true : null;
  return { pass, detail: { clauseC: struck ? 'struck by ruling poc-closure=literal (probe reported only)' : 'graded', static: st.detail, biome: dyn.detail?.gate ? { pass: dyn.detail.gate.pass, ...dyn.detail.gate.detail, consoleErrors: dyn.detail.gate.consoleErrors, error: dyn.detail.gate.error } : dyn.detail, biomeMs: dyn.detail?.ms } };
}

/* ---------------------------------------------------------------- */
/* A-licence-manifest: node clauses + the RENDERED in-game credits     */
/* ---------------------------------------------------------------- */
/**
 * W0b fix round 1 (judge: "the in-game credits clause can be satisfied by a
 * comment"). The gate is a PAGE gate now. Its node half — every clause of
 * `tools/licences/check.mjs` — runs once per process in a child
 * (`check.mjs --json-line`, synchronous, ~1 s) when the harness first reads
 * `assert`; the page half clicks the CREDITS button, waits for the modal and
 * grades the modal's DOM text with the SAME `gradeCredits` function check.mjs
 * uses (its source is embedded). menu.js's source text is never read. The
 * harness then films the open credits modal (shots/gates/A-licence-manifest.png).
 * A getter (not a value) so the node half is computed when the gate runs:
 * gates-perf's registry keeps accessors (withProps); main's harness spreads
 * rows at import, which evaluates it once at import — also correct.
 */
let licenceNodeHalf = null;
function licenceNode() {
  if (licenceNodeHalf) return licenceNodeHalf;
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/licences/check.mjs'), '--json-line'],
      { cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'pipe'] });
    licenceNodeHalf = JSON.parse(out.trim().split('\n').pop());
  } catch (e) {
    // check.mjs exits 1 on a FAIL verdict and still prints its report
    try { licenceNodeHalf = JSON.parse(String(e.stdout || '').trim().split('\n').pop()); } catch { licenceNodeHalf = { error: `check.mjs did not report: ${String(e.stderr || e.message).slice(0, 300)}` }; }
  }
  return licenceNodeHalf;
}
let gradeCreditsSrc = null;
async function loadGradeCredits() { gradeCreditsSrc = (await imp('tools/licences/check.mjs')).gradeCredits.toString(); }
await loadGradeCredits();
function licenceAssert() {
  const node = licenceNode();
  return `(async () => {
  const NODE = ${JSON.stringify(node)};
  if (NODE.error || !NODE.clauses) return { pass: false, detail: { error: NODE.error || 'no clauses from check.mjs' } };
  const gradeCredits = ${gradeCreditsSrc};
  const M = __CTX__.menus;
  let how = null, error = null;
  try {
    // the player's path: the CREDITS button of the menus (hub footer / title); the menus API only if no button exists
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim().toUpperCase() === 'CREDITS');
    if (btn) { btn.click(); how = 'CREDITS button'; } else if (M && M.openModal) { M.openModal('credits'); how = 'menus.openModal (no CREDITS button in the DOM)'; }
    else error = 'no CREDITS button and no menus.openModal';
  } catch (e) { error = String(e && e.message || e); }
  await new Promise((r) => setTimeout(r, 400));
  const body = (M && M.modalBody) || document.querySelector('.mn-modal-body');
  const modal = (M && M.modalEl) || (body && body.closest('.mn-modal'));
  const cs = modal ? getComputedStyle(modal) : null;
  const rect = body ? body.getBoundingClientRect() : null;
  const title = (M && M._modalTitle && M._modalTitle.textContent) || '';
  const visible = !!(cs && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0 && rect && rect.width > 0 && rect.height > 0
    && (!M || M.modal === 'credits'));
  const text = body ? body.textContent : '';
  const rendered = { how, visible, text, error };
  const credits = gradeCredits({ ...NODE.creditsInput, rendered });
  const clauses = { ...NODE.clauses, credits };
  const st = Object.values(clauses).map((c) => c.status);
  const pass = st.includes('FAIL') ? false : st.includes('PENDING') ? null : true;
  return { pass, detail: { summary: Object.fromEntries(Object.entries(clauses).map(([k, c]) => [k, c.status])), wave: NODE.wave,
    renderedCredits: { how, visible, modalTitle: title, chars: text.length, box: rect ? [Math.round(rect.width), Math.round(rect.height)] : null }, clauses } };
})()`;
}

/** A-human-bind: the hero body's rig profile binds every UAL clip bone (plan §9: 52/52, no missing source/target). */
const HUMAN_BIND = `(async () => {
  const A = __CTX__.assets, p = __CTX__.player, an = p?.animator, lib = an?.lib, rt = lib?.retargeter;
  const prof = p?.model?.userData?.rigProfile || A.models.hero?.root?.userData?.rigProfile || null;
  if (!prof) return { pass: null, detail: { pending: 'SKIP-pending (hero-body W0b): the hero body carries no rig profile yet (SPECS.hero still serves the Round-4 body); graded on the merged tree once Brea is the hero row', heroUrl: A.specs.hero?.url ?? null } };
  if (!an || !rt) return { pass: false, detail: { error: 'no animator / retargeter on the player' } };
  const mapSize = Object.keys(prof.map || {}).length;
  const keyMissing = Object.entries(an.KEY).filter(([k]) => !an.b[k]).map(([k]) => k);
  const allowed = /^(neck2|eye[LR]|lid(UL|LL|UR|LR))$/;
  const extraMissing = keyMissing.filter((k) => !allowed.test(k));
  const pairs = rt.pairs.length;
  const pass = pairs === 52 && mapSize === 52 && !rt.missingSource.length && !rt.missingTarget.length && !extraMissing.length;
  return { pass, detail: { rig: prof.name, heroUrl: A.specs.hero?.url ?? null, pairs, mapSize, missingSource: rt.missingSource, missingTarget: rt.missingTarget,
    keyMissing, extraMissing, animated: lib.animatedNames.size, hipScale: +rt.hipScale.toFixed(4) } };
})()`;
export const HUMAN_BIND_ASSERT = HUMAN_BIND;

export const GATES = [
  {
    id: 'A-ID-ip-assets-gone', kind: 'runner', lane: 'pipeline', timeout: 400000,
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
    id: 'A-sources-staged', kind: 'runner', lane: 'pipeline', timeout: 120000,
    title: 'models-staging/r5-src holds the trimmed UBC, MCO, UAL1, UAL2 (+ any scan/font source row) <= 150 MB, every file equal to the lock, archive SHA-256s equal to LICENSES.json, no transient zip',
    check: sourcesStaged,
  },
  {
    id: 'A-glb-budget', kind: 'runner', lane: 'pipeline', timeout: 120000,
    title: 'Every generated GLB under public/models is inside its plan 4.1 class budget (tris, draws, materials, bones, file size)',
    check: async () => (await imp('tools/build/pipeline/w0b-checks.mjs')).glbBudget(),
  },
  {
    id: 'A-build-only-lane', kind: 'runner', lane: 'pipeline', timeout: 1800000,
    title: 'build:assets --only <lane> for each lane writes only that lane\'s output paths (mtime audit of public/ + tools/build/), <= 60 s each',
    check: async () => (await imp('tools/build/pipeline/w0b-checks.mjs')).buildOnlyLane(),
  },
  {
    id: 'A-build-deterministic', kind: 'runner', lane: 'pipeline', timeout: 2400000,
    title: 'build:assets twice into two scratch dirs with the network denied: byte-identical GLB/WebP, <= 180 s, <= 2 GB peak RSS, sources from r5-src only',
    check: async () => (await imp('tools/build/pipeline/w0b-checks.mjs')).buildDeterministic(),
  },
  {
    id: 'A-specs-data-driven', kind: 'runner', lane: 'pipeline', timeout: 900000,
    title: 'SPECS are data: assets.js names no row; with the fixture row and its file removed in a scratch copy, A1 and A20b pass with 0 code edits',
    check: specsDataDriven,
  },
  {
    id: 'A-poc-promoted', kind: 'runner', lane: 'pipeline', timeout: 900000,
    title: 'W0 exit (literal): no ?poc=human|creature path in src/main.js; tools/r5-poc/ and public/models/r5-poc/ absent; ?poc=biome still serves A-gpu-tier. Never PASS with a file left in either folder; no reference to them outside the biome hook',
    check: pocPromoted,
  },
  {
    id: 'A-loader-fixes', kind: 'action', lane: 'pipeline', timeout: 90000, settle: 1500,
    title: 'Shared loader on a quantised generated GLB: dequantised error <= 1 mm, fold through rig/lod.js moves no vertex > 1 mm, labels via getX, lamp casts no shadow, entry disposes',
    assert: LOADER_FIXES,
  },
  {
    id: 'A-licence-manifest', kind: 'action', lane: 'pipeline', timeout: 60000, settle: 3000,
    title: 'public/LICENSES.json covers every public file exactly once; rows valid; archive SHA-256s; legacy rows sourced; MIT code rows; every CC-BY/MIT attribution verbatim in README Credits AND in the rendered in-game credits modal; public/ <= 60 MB',
    get assert() { return licenceAssert(); },
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
  {
    id: 'A-human-bind', kind: 'action', lane: 'pipeline', timeout: 60000, settle: 2000,
    title: 'The hero body binds through its rig profile: 52/52 UAL pairs, missingSource and missingTarget empty, missing animator keys within {neck2, eyes, lids}',
    assert: HUMAN_BIND,
  },
];
