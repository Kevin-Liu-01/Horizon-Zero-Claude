/**
 * W0b merge trial (pipeline lane, W0b fix round 5) — the orchestrator's W0b merge rehearsed in scratch, so the
 * merge steps of docs/ROUND5-PIPELINE.md §5 are run, not just written, before the sealed merge:
 *
 *   node tools/build/pipeline/w0b-merge-trial.mjs --scratch <dir> [--refs a,b,…] [--boot --port <p> --shots <dir>]
 *        -> one JSON line { pass: null, detail } (advisory ALWAYS: an unsealed trial grades nothing; the
 *           orchestrator's sealed run on the merged main does)
 *
 * 1. clone this tree into scratch; lay the W0b branches over it (merge-overlay.mjs: git show, read-only;
 *    LICENSES.json by fold.mjs = merge step 2; other both-sides paths by `git merge-file -p` = merge step 1
 *    for src/main.js)
 * 2. the remaining merge steps on the copy: 3 the R39 hero swap (hero-swap.mjs --write, then --verify),
 *    5 `add.mjs --prune-landed`, 6 brand's `tools/lint/credits-sync.mjs` (when the copy has it). Step 4 (font
 *    stage-files) and step 8 (archive restore) touch models-staging/r5-src only and are not rehearsed here.
 * 3. node projections of the global items this lane owns on the merged copy: A-licence-manifest's node clauses
 *    (no R5_WAVE, as on main, and R5_WAVE='W0 exit'), A-ID-ip-assets-gone (ip-scan.mjs scan), A-poc-promoted's
 *    static half (no ruling, and both ruling projections)
 * 4. --boot: ONE headless Chrome on the merged copy (specs-fixture serveAndRun; Vite middleware on a unix socket,
 *    scratch dep cache): A1, A20b, A-pipeline-boot-rows, the hero rows (filmed), A-licence-manifest with the
 *    RENDERED credits modal (filmed), A-human-bind, and `?poc=biome` serving
 * The copy is removed at the end. Nothing is written into the tree; no git write.
 */
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildTrial, applyHeroSwap, verifyHeroSwap, licenceSummary, HERO_ROWS_ASSERT } from './hero-swap.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const W0B_REFS = ['r5/w0b-instruments-core', 'r5/w0a-gates-perf', 'r5/w0b-engine-gpu', 'r5/w0b-hero-body', 'r5/w0b-brand'];

const runNode = (copy, rel, args, env = process.env) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, [path.join(copy, rel), ...args], { cwd: copy, env, encoding: 'utf8', maxBuffer: 64 * 2 ** 20, stdio: ['ignore', 'pipe', 'pipe'] }).trim().split('\n').pop() };
  } catch (e) {
    return { ok: false, code: e.status, out: String(e.stdout || '').trim().split('\n').pop(), err: String(e.stderr || e.message).slice(0, 300) };
  }
};

export async function w0bMergeTrial({ root = ROOT, scratch, refs = W0B_REFS, boot = false, port = 0, shots = null, keep = false } = {}) {
  const t0 = Date.now();
  mkdirSync(scratch, { recursive: true });
  const sc = realpathSync(scratch);
  const detail = { refs };
  let copy = null;
  try {
    const tr = await buildTrial({ root, scratch: sc, refs, name: 'w0b-merge-trial' });
    copy = tr.copy;
    detail.overlay = tr.overlay.map((o) => ({ ...o, merged: o.merged.map((m) => `${m.path} (${m.how}, with ${m.with})`) }));
    detail.conflicts = tr.overlay.flatMap((o) => o.conflicts.map((c) => ({ ref: o.ref, ...c })));
    // merge steps on the copy
    detail.steps = {};
    detail.steps['3-hero-swap'] = await applyHeroSwap({ root: copy, write: true, scratch: sc });
    detail.steps['5-prune-landed'] = runNode(copy, 'tools/licences/add.mjs', ['--prune-landed']);
    detail.steps['6-credits-sync'] = existsSync(path.join(copy, 'tools/lint/credits-sync.mjs')) ? runNode(copy, 'tools/lint/credits-sync.mjs', [])
      : { ok: null, why: 'tools/lint/credits-sync.mjs not in the merged copy (brand not merged)' };
    detail.steps['3-verify'] = await verifyHeroSwap({ root: copy, scratch: sc, rulesRoot: root });
    // node projections
    const env = { ...process.env }; delete env.R5_WAVE;
    detail.licence = { onMain: licenceSummary(copy) };
    const exitRun = runNode(copy, 'tools/licences/check.mjs', ['--json-line'], { ...env, R5_WAVE: 'W0 exit' });
    try {
      const r = JSON.parse(exitRun.out);
      detail.licence.atW0Exit = { pass: r.pass, summary: Object.fromEntries(Object.entries(r.clauses).map(([k, v]) => [k, v.status])),
        credits: { status: r.clauses.credits?.status, readme: `${r.clauses.credits?.readme?.shown}/${r.clauses.credits?.readme?.of}`, missing: r.clauses.credits?.readme?.missing },
        thirdPartyPending: (r.clauses['third-party']?.pending || []).map((p) => p.id), ipInvalid: (r.clauses['legacy-source']?.ipInvalid || []).map((x) => x.file || x.id),
        unmatched: r.clauses['files-matched']?.unmatched };
    } catch { detail.licence.atW0Exit = { error: exitRun.err || 'no report' }; }
    const ip = runNode(copy, 'tools/build/pipeline/w0b-merge-trial.mjs', ['--ip-scan-only', copy], env);
    try { detail.ipScan = JSON.parse(ip.out); } catch { detail.ipScan = { error: ip.err }; }
    const W = await import(pathToFileURL(path.join(copy, 'tools/build/pipeline/w0b-checks.mjs')).href);
    const poc = W.pocPromotedStatic({ root: copy, rulingMap: {} });
    detail.pocPromotedStatic = { pass: poc.pass, problems: poc.detail.problems, closureLeft: poc.detail.closureLeft,
      projections: poc.detail.projections };
    if (boot) {
      const { preflight, serveAndRun } = await import('./specs-fixture.mjs');
      let pf = preflight(root);
      for (let i = 0; !pf.ok && i < 18; i++) { await new Promise((r) => setTimeout(r, 10000)); pf = preflight(root); }
      detail.preflight = pf;
      if (pf.ok) {
        if (shots) mkdirSync(shots, { recursive: true });
        const { GATES } = await import(pathToFileURL(path.join(copy, 'tools/gates.config.mjs')).href);
        const P = await import(pathToFileURL(path.join(copy, 'tools/gates.r5.pipeline.mjs')).href);
        const B = await import(pathToFileURL(path.join(copy, 'tools/build/pipeline/biome-check.mjs')).href);
        const g = (id) => GATES.find((x) => x.id === id) || { id, missing: true };
        const lane = (id) => { const x = P.GATES.find((y) => y.id === id); return x ? { ...x } : { id, missing: true }; };
        const shot = (n) => (shots ? { shot: path.join(shots, `${n}.png`) } : {});
        const defs = [g('A1-boot-clean'), g('A20b-no-system-errors'), lane('A-pipeline-boot-rows'),
          { id: 'hero-swap-rows', settle: 3000, timeout: 30000, assert: HERO_ROWS_ASSERT, ...shot('merge-trial-hero') },
          lane('A-human-bind'), { ...lane('A-licence-manifest'), ...shot('merge-trial-credits') },
          { id: 'poc-biome-serves', params: 'poc=biome', ready: 'window.__R5BIOME_READY__ === true', settle: 1500, timeout: 30000, assert: B.BIOME_ASSERT }];
        const cacheDir = path.join(sc, `w0b-merge-trial-vite-${process.pid}`);
        const sock = path.join(os.tmpdir(), `cal-mt-${process.pid}.sock`);
        try {
          detail.boot = (await serveAndRun(copy, defs, { port, sock, cacheDir, onProbe: (p) => { detail.viteProbe = { ok: p.ok }; } }))
            .map((r) => ({ id: r.id, pass: r.pass, error: r.error, consoleErrors: r.consoleErrors, shot: r.shot, detail: r.detail }));
        } finally { rmSync(cacheDir, { recursive: true, force: true }); rmSync(sock, { force: true }); }
      }
    }
    return { pass: null, detail: { ...detail, note: 'advisory: an unsealed merge rehearsal; the orchestrator grades the merged main' } };
  } catch (e) {
    detail.error = String(e?.stack || e).slice(0, 800);
    return { pass: null, detail };
  } finally {
    if (copy && !keep) rmSync(copy, { recursive: true, force: true });
    detail.copyRemoved = copy ? !existsSync(copy) : null;
    detail.ms = Date.now() - t0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const val = (f, d = null) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  let res;
  if (a.includes('--ip-scan-only')) {
    // child mode: the copy's own ip-scan on the copy (its gltf-transform import resolves through the copy's node_modules)
    const copy = path.resolve(val('--ip-scan-only'));
    const { scan } = await import(pathToFileURL(path.join(copy, 'tools/licences/ip-scan.mjs')).href);
    const r = await scan(copy);
    res = { pass: r.pass, glbs: r.glbs, ipHits: r.ipHits, rowIpUnflagged: r.rowIpUnflagged, noProvenance: r.noProvenance, unreadable: r.unreadable,
      forbiddenLicences: r.forbiddenLicences, scheduledExceptions: r.scheduledExceptions, wave: r.wave?.wave ?? null };
  } else {
    if (!val('--scratch')) { process.stderr.write('usage: w0b-merge-trial.mjs --scratch <dir> [--refs a,b] [--boot --port <p> --shots <dir>] [--keep]\n'); process.exit(2); }
    res = await w0bMergeTrial({ scratch: val('--scratch'), refs: val('--refs') ? val('--refs').split(',') : W0B_REFS, boot: a.includes('--boot'),
      port: Number(val('--port', 0)), shots: val('--shots'), keep: a.includes('--keep') });
  }
  process.stdout.write(`${JSON.stringify(res)}\n`, () => process.exit(0));
}
